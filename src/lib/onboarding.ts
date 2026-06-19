export const ONBOARDING_KEY = "soupytag:onboarding:v1.2:complete";

type StorageReader = Pick<Storage, "getItem">;

export function hasCompletedCurrentOnboarding(storage: StorageReader): boolean {
  return storage.getItem(ONBOARDING_KEY) === "1";
}
