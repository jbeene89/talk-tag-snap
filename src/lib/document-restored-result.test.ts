import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRestoredResultListenerInstaller,
  DocumentRestoredResultCoordinator,
  type RestoredResultEvent,
} from "./document-restored-result.ts";
import { replaceTrailFromFile } from "./context-trail-recovery.ts";
import type { ContextTrail } from "./context-trail.ts";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const minimalTrail: ContextTrail = {
  version: 2,
  title: "Recovered inspection",
  report: { title: "Recheck", reference: "A-7" },
  levels: [],
};
const trailBase64 = btoa(JSON.stringify(minimalTrail));

function makeNearLimitTrailBase64(): string {
  const json = `${JSON.stringify(minimalTrail).slice(0, -1)},"padding":"${"x".repeat(9_000_000)}"}`;
  return btoa(json);
}

function makeLargeMalformedBase64(): string {
  return `${"A".repeat(11_999_996)}!AAA`;
}

function event(
  methodName: "saveDocument" | "openDocument",
  data: Record<string, unknown>,
): RestoredResultEvent {
  return { pluginId: "SoupyDocument", methodName, success: true, data };
}

test("installs one early listener and handles a result replayed during registration", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  const install = createRestoredResultListenerInstaller();
  let listener: ((value: RestoredResultEvent) => void) | undefined;
  let registrations = 0;
  const replay = event("saveDocument", {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "inspection.context-trail.json",
  });
  const register = async (receive: (value: RestoredResultEvent) => void) => {
    registrations += 1;
    listener = receive;
    queueMicrotask(() => receive(replay));
    return { remove() {} };
  };

  await Promise.all([install(register, (value) => void coordinator.acceptRestoredResult(value)),
    install(register, (value) => void coordinator.acceptRestoredResult(value))]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(registrations, 1);
  assert.equal(coordinator.getSnapshot().notice?.status, "saved");
  assert.ok(listener);
});

test("restored save success, cancellation, and failure have distinct truthful outcomes", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  await coordinator.acceptRestoredResult(event("saveDocument", {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "verified.json",
  }));
  assert.deepEqual(coordinator.getSnapshot().notice, {
    operation: "saveDocument",
    status: "saved",
    fileName: "verified.json",
  });

  const cancelId = "223e4567-e89b-42d3-a456-426614174000";
  await coordinator.acceptRestoredResult(event("saveDocument", {
    requestId: cancelId,
    ok: false,
    cancelled: true,
  }));
  assert.equal(coordinator.getSnapshot().notice?.status, "cancelled");

  const failedId = "323e4567-e89b-42d3-a456-426614174000";
  await coordinator.acceptRestoredResult(event("saveDocument", {
    requestId: failedId,
    ok: false,
    cancelled: false,
    errorCode: "save_failed",
  }));
  assert.equal(coordinator.getSnapshot().notice?.status, "failed");
  assert.equal("base64" in coordinator.getSnapshot(), false);
});

test("an ordinary result and its restored duplicate resolve once and stage one import", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  const result = {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "recovered.json",
    mimeType: "application/json",
    base64: trailBase64,
  };
  const waiting = coordinator.waitFor("openDocument", requestId);
  await coordinator.acceptPromiseResult("openDocument", requestId, result);
  await coordinator.acceptRestoredResult(event("openDocument", result));
  const opened = await waiting;

  assert.equal(opened.operation, "openDocument");
  assert.equal(opened.cancelled, false);
  assert.equal(coordinator.getSnapshot().pendingImport?.fileName, "recovered.json");
  assert.deepEqual(JSON.parse(await coordinator.getSnapshot().pendingImport!.file.text()), minimalTrail);
});

test("a restored open is retained both before editor hydration and for a later subscriber", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  await coordinator.acceptRestoredResult(event("openDocument", {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "inspection.html",
    mimeType: "text/html",
    base64: trailBase64,
  }));
  const beforeHydration = coordinator.getSnapshot().pendingImport;
  assert.equal(beforeHydration?.fileName, "inspection.html");

  let afterHydration = coordinator.getSnapshot().pendingImport;
  const unsubscribe = coordinator.subscribe((snapshot) => {
    afterHydration = snapshot.pendingImport;
  });
  assert.equal(afterHydration?.requestId, beforeHydration?.requestId);
  unsubscribe();
});

test("declining a recovered open clears only the staged import and keeps it non-destructive", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  await coordinator.acceptRestoredResult(event("openDocument", {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "inspection.json",
    base64: trailBase64,
  }));
  coordinator.dismissPendingImport(requestId);
  assert.equal(coordinator.getSnapshot().pendingImport, null);
  assert.equal(coordinator.getSnapshot().notice?.status, "declined");
});

test("ignores unrelated plugins, methods, and malformed request metadata", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  assert.equal(
    await coordinator.acceptRestoredResult({
      ...event("saveDocument", { requestId, ok: true }),
      pluginId: "OtherPlugin",
    }),
    false,
  );
  assert.equal(
    await coordinator.acceptRestoredResult({
      ...event("saveDocument", { requestId, ok: true }),
      methodName: "deleteDocument",
    }),
    false,
  );
  assert.equal(
    await coordinator.acceptRestoredResult(
      event("saveDocument", { requestId: "not-a-request-id", ok: true }),
    ),
    false,
  );
  assert.equal(coordinator.getSnapshot().notice?.status, "failed");
});

test("malformed restored trail content is rejected without staging an import", async () => {
  const coordinator = new DocumentRestoredResultCoordinator();
  await coordinator.acceptRestoredResult(event("openDocument", {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "bad.json",
    base64: btoa("{not a trail"),
  }));
  assert.equal(coordinator.getSnapshot().pendingImport, null);
  assert.equal(coordinator.getSnapshot().notice?.status, "failed");
});

test("near-limit valid Base64 opens through ordinary and restored results without regex stack overflow", async () => {
  const base64 = makeNearLimitTrailBase64();
  assert.ok(base64.length > 12_000_000);
  const result = {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "large-inspection.json",
    mimeType: "application/json",
    base64,
  };

  const ordinary = new DocumentRestoredResultCoordinator();
  const ordinaryOpen = ordinary.waitFor("openDocument", requestId);
  await assert.doesNotReject(ordinary.acceptPromiseResult("openDocument", requestId, result));
  assert.equal((await ordinaryOpen).operation, "openDocument");
  assert.equal(ordinary.getSnapshot().pendingImport?.fileName, "large-inspection.json");

  const restored = new DocumentRestoredResultCoordinator();
  await assert.doesNotReject(
    restored.acceptRestoredResult(event("openDocument", result)),
  );
  assert.equal(restored.getSnapshot().pendingImport?.fileName, "large-inspection.json");
});

test("large malformed Base64 fails safely for ordinary and restored Open without staging", async () => {
  const base64 = makeLargeMalformedBase64();
  const result = {
    requestId,
    ok: true,
    cancelled: false,
    fileName: "malformed.json",
    mimeType: "application/json",
    base64,
  };

  const ordinary = new DocumentRestoredResultCoordinator();
  const waiting = ordinary.waitFor("openDocument", requestId);
  const ordinaryResult = ordinary.acceptPromiseResult("openDocument", requestId, result);
  const [acceptance, caller] = await Promise.allSettled([ordinaryResult, waiting]);
  assert.equal(acceptance.status, "rejected");
  assert.equal(caller.status, "rejected");
  if (acceptance.status === "rejected") {
    const error: unknown = acceptance.reason;
    assert.ok(error instanceof Error);
    assert.notEqual(error.name, "RangeError");
    assert.match(error.message, /malformed or too large/);
  }
  assert.equal(ordinary.getSnapshot().pendingImport, null);

  const restored = new DocumentRestoredResultCoordinator();
  await assert.doesNotReject(
    restored.acceptRestoredResult(event("openDocument", result)),
  );
  assert.equal(restored.getSnapshot().pendingImport, null);
  assert.equal(restored.getSnapshot().notice?.status, "failed");
});

test("confirmation backs up the latest draft changed while the recovered import was pending", async () => {
  let current: ContextTrail = {
    ...minimalTrail,
    title: "Draft before picker",
    report: { title: "", reference: "" },
  };
  const imported = { ...minimalTrail, title: "Recovered replacement" };
  const saved: ContextTrail[] = [];
  const backup: ContextTrail[] = [];
  const committed: ContextTrail[] = [];
  const file = new File([JSON.stringify(imported)], "pending.json", { type: "application/json" });

  current = { ...current, title: "Edits made while import was pending" };
  const createdBackup = await replaceTrailFromFile({
    file,
    current: () => current,
    prepare: async (trail) => trail,
    saveCurrent: async (trail) => {
      saved.push(trail);
    },
    saveBackup: async (trail) => {
      backup.push(trail);
    },
    commit: (trail) => committed.push(trail),
  });

  assert.equal(createdBackup, true);
  assert.equal(saved[0]?.title, "Edits made while import was pending");
  assert.equal(backup[0]?.title, "Edits made while import was pending");
  assert.equal(committed[0]?.title, "Recovered replacement");
});
