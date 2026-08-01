const DOCUMENT_SURFACES = Object.freeze(['writer', 'calc', 'impress', 'draw', 'base', 'math']);
const RICH_TEXT_SURFACES = Object.freeze(['writer', 'impress']);

const capability = (handler, surfaces = null) => Object.freeze({
  enabled: true,
  handler,
  surfaces: surfaces ? Object.freeze([...surfaces]) : null
});

const unsupported = Object.freeze({
  enabled: false,
  handler: null,
  surfaces: null
});

const DIRECT = Object.freeze({
  about: capability('direct'),
  'base-add-record': capability('direct', ['base']),
  'base-delete-record': capability('direct', ['base']),
  'base-export-csv': capability('direct', ['base']),
  'close-active-tab': capability('direct'),
  'close-window': capability('generic'),
  'draw-delete': capability('direct', ['draw']),
  'draw-ellipse': capability('direct', ['draw']),
  'draw-line': capability('direct', ['draw']),
  'draw-rect': capability('direct', ['draw']),
  'draw-select': capability('direct', ['draw']),
  'draw-text': capability('direct', ['draw']),
  'export-document': capability('direct', DOCUMENT_SURFACES),
  'export-pdf': capability('direct', DOCUMENT_SURFACES),
  'font-family': capability('change', RICH_TEXT_SURFACES),
  'font-size': capability('change', RICH_TEXT_SURFACES),
  help: capability('generic'),
  'math-insert': capability('generic', ['math']),
  'math-update': capability('generic', ['math']),
  'navigate-home': capability('direct'),
  'navigate-settings': capability('direct'),
  'new-document': capability('direct'),
  'new-window': capability('generic'),
  'open-file': capability('direct'),
  present: capability('direct', ['impress']),
  'present-current': capability('direct', ['impress']),
  print: capability('direct', DOCUMENT_SURFACES),
  'save-as': capability('direct', DOCUMENT_SURFACES),
  'save-document': capability('direct'),
  'slide-add': capability('direct', ['impress']),
  'slide-delete': capability('direct', ['impress']),
  'slide-duplicate': capability('direct', ['impress']),
  'slide-layout': capability('direct', ['impress']),
  'slide-properties': capability('generic', ['impress'])
});

const GENERIC = Object.freeze(Object.fromEntries([
  'align-center', 'align-left', 'align-right', 'bold', 'clear-format', 'copy', 'cut',
  'italic', 'justify', 'list-bullets', 'list-numbers', 'paste', 'redo', 'select-all',
  'strike', 'style-default', 'style-h1', 'style-h2', 'underline', 'undo'
].map((action) => [action, capability('generic', RICH_TEXT_SURFACES)]).concat([
  ['close-window', capability('generic')],
  ['find-replace', capability('generic', RICH_TEXT_SURFACES)],
  ['insert-page-break', capability('generic', ['writer'])],
  ['toggle-properties', capability('generic', DOCUMENT_SURFACES)],
  ['toggle-status', capability('generic', DOCUMENT_SURFACES)],
  ['view-normal', capability('generic', ['writer'])],
  ['view-web', capability('generic', ['writer'])],
  ['word-count', capability('generic', ['writer'])],
  ['zoom-in', capability('generic', DOCUMENT_SURFACES)],
  ['zoom-out', capability('generic', DOCUMENT_SURFACES)]
])));

const ALL_STATIC_ACTIONS = Object.freeze([
  'about', 'align-center', 'align-left', 'align-right', 'autocorrect', 'base-add-record',
  'base-delete-record', 'base-export-csv', 'bold', 'clear-format', 'close-active-tab',
  'close-window', 'copy', 'cut', 'delete-row', 'draw-add-page', 'draw-delete',
  'draw-ellipse', 'draw-line', 'draw-rect', 'draw-rename-page', 'draw-select', 'draw-text',
  'export-document', 'export-pdf', 'filter-data', 'find-replace', 'font-family', 'font-size',
  'form-design', 'format-character', 'format-currency', 'format-list', 'format-page',
  'format-paragraph', 'format-percent', 'group-data', 'help', 'insert-button',
  'insert-chart', 'insert-checkbox', 'insert-column', 'insert-image', 'insert-link',
  'insert-page-break', 'insert-row', 'insert-table', 'insert-text', 'italic', 'justify',
  'libreoffice-macros', 'list-bullets', 'list-numbers', 'manage-styles', 'math-insert',
  'math-update', 'merge-cells', 'named-ranges', 'navigate-home', 'navigate-settings',
  'new-document', 'new-window', 'open-file', 'page-properties', 'paragraph-style', 'paste',
  'pivot-table', 'present', 'present-current', 'present-settings', 'print', 'redo',
  'save-as', 'save-document', 'select-all', 'shape-arrange', 'shape-group', 'shape-rotate',
  'slide-add', 'slide-delete', 'slide-duplicate', 'slide-layout', 'slide-properties',
  'sort-data', 'special-character', 'spelling', 'split-cells', 'strike', 'style-default',
  'style-h1', 'style-h2', 'toggle-properties', 'toggle-status', 'underline', 'undo',
  'view-normal', 'view-web', 'whats-this', 'word-count', 'zoom-in', 'zoom-out'
]);

export const STATIC_COMMAND_CAPABILITIES = Object.freeze(Object.fromEntries(
  ALL_STATIC_ACTIONS.map((action) => [action, DIRECT[action] ?? GENERIC[action] ?? unsupported])
));

export const GENERIC_COMMAND_ACTIONS = Object.freeze(
  Object.entries(STATIC_COMMAND_CAPABILITIES)
    .filter(([, entry]) => entry.enabled && entry.handler === 'generic')
    .map(([action]) => action)
);

export function staticCommandCapability(action, surface = null) {
  const entry = STATIC_COMMAND_CAPABILITIES[action] ?? unsupported;
  if (!entry.enabled) return entry;
  if (entry.surfaces && !entry.surfaces.includes(surface)) return unsupported;
  return entry;
}

export function unsupportedCommandReason(action, surface, localize = null) {
  const facts = {
    action: String(action ?? '').replaceAll('-', ' '),
    surface: String(surface ?? 'current')
  };
  const english = '{action} is not implemented for the {surface} editor. No blank LibreOffice document will be opened in its place.';
  const cantonese = '{surface} 編輯器未支援 {action}。系統唔會扮成功，亦唔會改為開一份空白 LibreOffice 文件。';
  if (typeof localize === 'function') return localize(english, cantonese, facts);
  return english.replace('{action}', facts.action).replace('{surface}', facts.surface);
}
