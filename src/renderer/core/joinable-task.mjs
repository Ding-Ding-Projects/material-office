/**
 * Returns a runner that shares one in-flight promise between every caller.
 * A later call starts only after the previous operation has settled.
 */
export function createJoinableTask(operation) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  let active = null;
  return function runJoinableTask(...args) {
    if (active) return active;
    const task = Promise.resolve().then(() => operation(...args));
    const joined = task.finally(() => {
      if (active === joined) active = null;
    });
    active = joined;
    return joined;
  };
}
