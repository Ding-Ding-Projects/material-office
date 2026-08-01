export function rovingTabIndex(key, currentIndex, count, options = {}) {
  if (!Number.isSafeInteger(count) || count < 1) return -1;
  const current = Math.max(0, Math.min(count - 1, Number(currentIndex) || 0));
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const horizontal = options.orientation !== 'vertical';
  const previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
  const next = horizontal ? 'ArrowRight' : 'ArrowDown';
  if (key === previous) return (current - 1 + count) % count;
  if (key === next) return (current + 1) % count;
  return -1;
}

export function handleRovingTabKey(event, tabs, options = {}) {
  const items = Array.from(tabs ?? []).filter((tab) => !tab.disabled && tab.getAttribute?.('aria-disabled') !== 'true');
  const index = items.indexOf(event?.currentTarget ?? event?.target);
  const next = rovingTabIndex(event?.key, index, items.length, options);
  if (next < 0) return false;
  event.preventDefault?.();
  items.forEach((tab, itemIndex) => { tab.tabIndex = itemIndex === next ? 0 : -1; });
  items[next].focus?.();
  if (options.activate !== false) items[next].click?.();
  return true;
}
