/** Serialize writes while replacing pending snapshots with the most recent edit.
 * Callers must treat snapshots as immutable. Every promise waits for its edit,
 * or a newer snapshot that supersedes it, to finish persisting.
 */
export function createLatestWriter<T>(persist: (snapshot: T) => Promise<void>) {
  type Job = {
    snapshot: T;
    waiters: { resolve: () => void; reject: (error: unknown) => void }[];
  };
  let pending: Job | undefined;
  let running = false;
  async function drain() {
    while (pending) {
      const job = pending;
      pending = undefined;
      try {
        await persist(job.snapshot);
        for (const waiter of job.waiters) waiter.resolve();
      } catch (error) {
        for (const waiter of job.waiters) waiter.reject(error);
      }
    }
    running = false;
  }
  return (snapshot: T): Promise<void> =>
    new Promise((resolve, reject) => {
      if (pending) {
        pending.snapshot = snapshot;
        pending.waiters.push({ resolve, reject });
      } else {
        pending = { snapshot, waiters: [{ resolve, reject }] };
      }
      if (!running) {
        running = true;
        // Coalesce synchronous edits before cloning/validating a large trail.
        void Promise.resolve().then(drain);
      }
    });
}
