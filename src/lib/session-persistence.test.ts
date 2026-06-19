import assert from "node:assert/strict";
import test from "node:test";

import { getSessionPersistenceAction } from "./session-persistence.ts";

test("skips persistence until the saved session has finished hydrating", () => {
  assert.equal(getSessionPersistenceAction(false, null, null), "skip");
});
