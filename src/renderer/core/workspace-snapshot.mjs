export function createWorkspaceSnapshot(state) {
  const snapshot = structuredClone(state);
  snapshot.notifications = Array.isArray(snapshot.notifications)
    ? snapshot.notifications.filter((notice) => notice?.localOnly !== true)
    : [];
  snapshot.runtime = {
    ...(snapshot.runtime && typeof snapshot.runtime === 'object' ? snapshot.runtime : {}),
    openMenu: null,
    menuAnchor: null,
    statusMessage: ''
  };
  return snapshot;
}
