const tails = new Map<string, Promise<unknown>>();

/** Runs fn after all earlier work on the same key (a node id) has finished. */
export function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  tails.set(key, run.catch(() => undefined));
  return run;
}
