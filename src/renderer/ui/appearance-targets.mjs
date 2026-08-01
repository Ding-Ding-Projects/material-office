const TARGET_SELECTOR = [
  'button', 'input', 'select', 'textarea', 'progress', 'a', '[role]',
  'main', 'section', 'nav', 'header', 'footer', 'article', 'aside', 'div', 'span',
  'h1', 'h2', 'h3', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'svg', 'g', 'rect', 'ellipse', 'line', 'text', 'math'
].join(',');

const SEMANTIC_ATTRIBUTES = [
  'data-surface', 'data-action', 'data-search-id', 'data-tab-id', 'data-tab-group-id', 'data-group-id',
  'data-document-id', 'data-cell', 'data-slide-id', 'data-slide-field', 'data-shape-id',
  'data-record-id', 'data-record-field', 'data-notification-id', 'data-toast-id', 'data-key', 'data-panel', 'data-modal-action'
];

const UNIQUE_ATTRIBUTES = new Set([
  'data-search-id', 'data-tab-id', 'data-tab-group-id', 'data-document-id', 'data-cell', 'data-slide-id',
  'data-shape-id', 'data-record-id', 'data-notification-id', 'data-toast-id', 'data-key'
]);

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 96);
}

function siblingIndex(element) {
  let index = 0;
  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.localName === element.localName) index += 1;
  }
  return index;
}

function segment(element) {
  if (element.id) return `${element.localName}#${clean(element.id)}`;
  const semantic = SEMANTIC_ATTRIBUTES.find((name) => element.hasAttribute(name));
  const value = semantic ? `${semantic.slice(5)}=${clean(element.getAttribute(semantic))}` : '';
  const position = semantic && UNIQUE_ATTRIBUTES.has(semantic) ? '' : `:${siblingIndex(element)}`;
  return `${element.localName}${position}${value ? `[${value}]` : ''}`;
}

export function appearanceTargetId(element, container) {
  if (!(element instanceof Element) || !(container instanceof Element) || !container.contains(element)) return null;
  const parts = [];
  for (let current = element; current && current !== container; current = current.parentElement) parts.push(segment(current));
  const scope = clean(container.id || container.getAttribute('aria-label') || container.localName);
  return `auto:${scope}:${parts.reverse().join('/')}`.slice(0, 480);
}

export function registerAppearanceTargets(containers) {
  let assigned = 0;
  for (const container of containers) {
    if (!(container instanceof Element)) continue;
    for (const element of container.querySelectorAll(TARGET_SELECTOR)) {
      if (element.hasAttribute('data-appearance-id')) continue;
      const id = appearanceTargetId(element, container);
      if (!id) continue;
      element.setAttribute('data-appearance-id', id);
      assigned += 1;
    }
  }
  return assigned;
}
