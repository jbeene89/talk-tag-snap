import assert from "node:assert/strict";
import test from "node:test";

import { hasCompletedCurrentOnboarding } from "./onboarding.ts";

test("shows the v1.2 walkthrough to users who only completed an older walkthrough", () => {
  const oldStorage = {
    getItem(key: string) {
      return key === "soupytag:onboarding:v1:complete" ? "1" : null;
    },
  };

  assert.equal(hasCompletedCurrentOnboarding(oldStorage), false);
});

test("does not repeat the current walkthrough after it is completed", () => {
  const currentStorage = {
    getItem(key: string) {
      return key === "soupytag:onboarding:v1.2:complete" ? "1" : null;
    },
  };

  assert.equal(hasCompletedCurrentOnboarding(currentStorage), true);
});
