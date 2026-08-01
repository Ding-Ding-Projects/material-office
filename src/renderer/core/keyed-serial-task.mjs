export function createKeyedSerialTask(operation) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  const tails = new Map();

  return function runKeyedSerialTask(key, ...args) {
    const previous = tails.get(key) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() => operation(...args));
    let tracked;
    tracked = task.finally(() => {
      if (tails.get(key) === tracked) tails.delete(key);
    });
    tails.set(key, tracked);
    return tracked;
  };
}
