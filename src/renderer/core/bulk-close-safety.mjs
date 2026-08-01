function text(value) {
  return typeof value === 'string' ? value : '';
}

export function createBulkCloseSafetyKey(tabState, preview) {
  const items = Array.isArray(tabState?.items) ? tabState.items : [];
  const groups = Array.isArray(tabState?.groups) ? tabState.groups : [];
  return JSON.stringify({
    activeId: text(tabState?.activeId),
    items: items.map((tab) => ({
      id: text(tab?.id),
      label: text(tab?.label),
      title: text(tab?.title),
      groupId: tab?.groupId == null ? null : text(tab.groupId),
      pinned: tab?.pinned === true,
      unsaved: tab?.unsaved === true
    })),
    groups: groups.map((group) => ({
      id: text(group?.id),
      pinned: group?.pinned === true
    })),
    preview: {
      query: text(preview?.query),
      mode: preview?.mode === 'regex' ? 'regex' : 'plain',
      pattern: text(preview?.pattern),
      flags: text(preview?.flags),
      inverse: preview?.inverse === true,
      includePinned: preview?.includePinned === true,
      affectedIds: Array.isArray(preview?.affectedIds) ? preview.affectedIds.map(text) : []
    }
  });
}
