/**
 * In-process async mutex keyed by string (single Node instance).
 */
export function createMutexPool() {
  const locks = new Map();

  return async function withLock(key, fn) {
    const previous = locks.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => null).then(() => gate);
    locks.set(key, tail);

    await previous.catch(() => null);
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === tail) {
        locks.delete(key);
      }
    }
  };
}
