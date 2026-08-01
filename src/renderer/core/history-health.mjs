export function createHistoryHealthState(available = true) {
  return Object.freeze({ status: available ? 'healthy' : 'degraded' });
}

export function transitionHistoryHealth(previous, available) {
  const before = previous?.status === 'degraded' ? 'degraded' : 'healthy';
  const after = available ? 'healthy' : 'degraded';
  return {
    state: createHistoryHealthState(available),
    event: before === after ? null : after
  };
}

export function historyAvailabilityFromResult(history) {
  if (history?.recorded === true) return true;
  if (history?.errorCode === 'HISTORY_UNAVAILABLE' || history?.errorCode === 'HISTORY_WRITE_FAILED') return false;
  return null;
}

