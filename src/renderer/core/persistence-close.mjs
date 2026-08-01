function normalizePersistenceState(value) {
  const requestedGeneration = Number.isSafeInteger(value?.requestedGeneration)
    ? value.requestedGeneration
    : 0;
  const completedGeneration = Number.isSafeInteger(value?.completedGeneration)
    ? value.completedGeneration
    : 0;
  return {
    scheduled: value?.scheduled === true,
    inFlight: value?.inFlight === true,
    requestedGeneration,
    completedGeneration
  };
}

export function hasPendingPersistence(value) {
  const state = normalizePersistenceState(value);
  return state.scheduled || state.inFlight || state.completedGeneration < state.requestedGeneration;
}

export function canUsePersistenceCloseApproval(value) {
  if (!Number.isSafeInteger(value?.approvedGeneration) || value.approvedGeneration < 0) return false;
  const state = normalizePersistenceState(value);
  return (
    value.unsaved !== true &&
    state.scheduled === false &&
    state.inFlight === false &&
    state.requestedGeneration === value.approvedGeneration &&
    state.completedGeneration >= value.approvedGeneration
  );
}

export async function flushPersistenceBeforeClose({ readState, cancelScheduled, flush, maxPasses = 4 }) {
  if (typeof readState !== 'function') throw new TypeError('readState must be a function');
  if (typeof cancelScheduled !== 'function') throw new TypeError('cancelScheduled must be a function');
  if (typeof flush !== 'function') throw new TypeError('flush must be a function');
  if (!Number.isSafeInteger(maxPasses) || maxPasses < 1 || maxPasses > 64) {
    throw new TypeError('maxPasses must be an integer from 1 to 64');
  }

  let current = normalizePersistenceState(readState());
  if (!hasPendingPersistence(current)) {
    return {
      flushed: false,
      persisted: true,
      targetGeneration: current.requestedGeneration,
      completedGeneration: current.completedGeneration
    };
  }

  let flushed = false;
  let passes = 0;
  cancelScheduled();
  while (true) {
    current = normalizePersistenceState(readState());
    if (!hasPendingPersistence(current)) {
      return {
        flushed,
        persisted: true,
        targetGeneration: current.requestedGeneration,
        completedGeneration: current.completedGeneration
      };
    }

    const targetGeneration = current.requestedGeneration;
    if (passes >= maxPasses) {
      return {
        flushed,
        persisted: false,
        reason: 'non-quiescent',
        targetGeneration,
        completedGeneration: current.completedGeneration
      };
    }
    passes += 1;
    flushed = true;
    await flush();
    cancelScheduled();
    const after = normalizePersistenceState(readState());
    if (after.completedGeneration < targetGeneration) {
      if (after.completedGeneration > current.completedGeneration) continue;
      return {
        flushed,
        persisted: false,
        targetGeneration,
        completedGeneration: after.completedGeneration
      };
    }
    if (!hasPendingPersistence(after)) {
      return {
        flushed,
        persisted: true,
        targetGeneration: after.requestedGeneration,
        completedGeneration: after.completedGeneration
      };
    }
  }
}
