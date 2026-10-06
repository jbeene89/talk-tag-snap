import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestWriter } from "./latest-writer.ts";

test("pending edits coalesce and close waits for the most recent snapshot", async () => {
  const writes: number[] = [];
  const gates: (() => void)[] = [];
  const write = createLatestWriter<number>(async (snapshot) => {
    writes.push(snapshot);
    await new Promise<void>((resolve) => gates.push(resolve));
  });
  const first = write(1);
  await Promise.resolve();
  const promises = [write(2), write(3), write(4)];
  let finished = false;
  void promises[2].then(() => {
    finished = true;
  });
  assert.deepEqual(writes, [1]);
  gates.shift()!();
  await first;
  assert.deepEqual(writes, [1, 4]);
  assert.equal(finished, false);
  gates.shift()!();
  await Promise.all(promises);
  assert.equal(finished, true);
});

test("failed storage does not block a later successful save", async () => {
  const writes: number[] = [];
  const write = createLatestWriter<number>(async (snapshot) => {
    writes.push(snapshot);
    if (snapshot === 1) throw new Error("storage full");
  });
  await assert.rejects(write(1), /storage full/);
  await write(2);
  assert.deepEqual(writes, [1, 2]);
});
