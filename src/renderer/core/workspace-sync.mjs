const MISSING = Symbol('missing-workspace-value');
const MAX_REPORTED_CONFLICTS = 100;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valuesEqual(left, right) {
  if (left === right) return true;
  if (left === MISSING || right === MISSING) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => valuesEqual(entry, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => (
    key === rightKeys[index] && valuesEqual(left[key], right[key])
  ));
}

function cloneValue(value) {
  return value === MISSING ? MISSING : structuredClone(value);
}

function childPath(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function mergeValue(base, local, remote, path, conflicts) {
  if (valuesEqual(local, remote)) return cloneValue(local);
  if (valuesEqual(local, base)) return cloneValue(remote);
  if (valuesEqual(remote, base)) return cloneValue(local);

  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const merged = Object.create(null);
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of [...keys].sort()) {
      const next = mergeValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        childPath(path, key),
        conflicts
      );
      if (next !== MISSING) merged[key] = next;
    }
    return merged;
  }

  if (conflicts.length < MAX_REPORTED_CONFLICTS) conflicts.push(path);
  return cloneValue(local);
}

/**
 * Conservatively three-way merges workspace JSON. Object properties merge
 * independently; arrays and scalar values are atomic so concurrent edits to
 * either are reported instead of guessed at or overwritten.
 */
export function mergeWorkspaceStates(base, local, remote) {
  const conflicts = [];
  const state = mergeValue(base, local, remote, '$', conflicts);
  return {
    state: state === MISSING ? null : state,
    conflicts,
    conflictsTruncated: conflicts.length === MAX_REPORTED_CONFLICTS
  };
}

export function isWorkspaceEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.revision === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.revision) &&
    Object.hasOwn(value, 'state')
  );
}
