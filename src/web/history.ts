/** One reversible change to the Canvas layout or structure. */
export interface Action {
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** Undo/redo stacks. Lives in memory only; actions run one at a time, in order. */
export class History {
  private past: Action[] = [];
  private future: Action[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  /** Calls `fn` after every change of the stacks; returns the way to stop. */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private changed() {
    this.listeners.forEach((fn) => fn());
  }

  push(action: Action) {
    this.past.push(action);
    this.future = [];
    this.changed();
  }

  undo(): Promise<void> {
    return this.step(this.past, this.future, "undo");
  }

  redo(): Promise<void> {
    return this.step(this.future, this.past, "redo");
  }

  /** Steps queue up behind the running one instead of being dropped. */
  private step(from: Action[], to: Action[], dir: "undo" | "redo"): Promise<void> {
    const run = async () => {
      const action = from.pop();
      if (!action) return;
      try {
        await action[dir]();
        to.push(action);
      } finally {
        this.changed();
      }
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
