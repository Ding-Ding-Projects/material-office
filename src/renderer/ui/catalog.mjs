export const APP_SURFACES = [
  { id: 'home', label: 'Home', yue: '主頁', glyph: '⌂', kind: 'system' },
  { id: 'writer', label: 'Writer', yue: '文字', glyph: '▤', kind: 'document', extension: 'odt' },
  { id: 'calc', label: 'Calc', yue: '試算表', glyph: '▦', kind: 'document', extension: 'ods' },
  { id: 'impress', label: 'Impress', yue: '簡報', glyph: '▣', kind: 'document', extension: 'odp' },
  { id: 'draw', label: 'Draw', yue: '繪圖', glyph: '◇', kind: 'document', extension: 'odg' },
  { id: 'base', label: 'Base', yue: '資料庫', glyph: '◫', kind: 'document', extension: 'odb' },
  { id: 'math', label: 'Math', yue: '方程式', glyph: '∑', kind: 'document', extension: 'odf' },
  { id: 'components', label: 'Components', yue: '元件', glyph: '◈', kind: 'tool' },
  { id: 'commands', label: 'Commands', yue: '指令', glyph: '⌘', kind: 'tool' },
  { id: 'history', label: 'History', yue: '版本', glyph: '↺', kind: 'tool' },
  { id: 'dialogs', label: 'Dialogs', yue: '對話框', glyph: '▰', kind: 'tool' },
  { id: 'changelog', label: 'Changelog', yue: '更新紀錄', glyph: '✦', kind: 'system' },
  { id: 'settings', label: 'Settings', yue: '設定', glyph: '⚙', kind: 'system' }
];

export const DOCUMENT_APPS = APP_SURFACES.filter((surface) => surface.kind === 'document');

export const MENUS = {
  writer: ['File', 'Edit', 'View', 'Insert', 'Format', 'Styles', 'Table', 'Form', 'Tools', 'Window', 'Help'],
  calc: ['File', 'Edit', 'View', 'Insert', 'Format', 'Sheet', 'Data', 'Tools', 'Window', 'Help'],
  impress: ['File', 'Edit', 'View', 'Insert', 'Format', 'Slide', 'Slide Show', 'Tools', 'Window', 'Help'],
  draw: ['File', 'Edit', 'View', 'Insert', 'Format', 'Page', 'Shape', 'Tools', 'Window', 'Help'],
  base: ['File', 'Edit', 'View', 'Insert', 'Tools', 'Window', 'Help'],
  math: ['File', 'Edit', 'View', 'Format', 'Tools', 'Window', 'Help']
};

export const MENU_ITEMS = {
  File: [
    ['New', 'new-document', 'Ctrl+N'], ['Open…', 'open-file', 'Ctrl+O'], ['Recent documents', 'navigate-home'],
    null, ['Save', 'save-document', 'Ctrl+S'], ['Save as…', 'save-as', 'Ctrl+Shift+S'], ['Export…', 'export-document'],
    ['Export as PDF…', 'export-pdf'], null, ['Print…', 'print', 'Ctrl+P'], ['Close tab', 'close-active-tab', 'Ctrl+W']
  ],
  Edit: [
    ['Undo', 'undo', 'Ctrl+Z'], ['Redo', 'redo', 'Ctrl+Y'], null, ['Cut', 'cut', 'Ctrl+X'], ['Copy', 'copy', 'Ctrl+C'],
    ['Paste', 'paste', 'Ctrl+V'], null, ['Find & replace…', 'find-replace', 'Ctrl+H'], ['Select all', 'select-all', 'Ctrl+A']
  ],
  View: [
    ['Normal', 'view-normal'], ['Web', 'view-web'], null, ['Zoom in', 'zoom-in', 'Ctrl++'], ['Zoom out', 'zoom-out', 'Ctrl+-'],
    ['Toggle properties', 'toggle-properties'], ['Toggle status bar', 'toggle-status']
  ],
  Insert: [
    ['Image…', 'insert-image'], ['Chart…', 'insert-chart'], ['Table…', 'insert-table'], ['Text box', 'insert-text'],
    null, ['Page break', 'insert-page-break', 'Ctrl+Enter'], ['Special character…', 'special-character'], ['Hyperlink…', 'insert-link']
  ],
  Format: [
    ['Character…', 'format-character'], ['Paragraph…', 'format-paragraph'], ['Bullets and numbering…', 'format-list'],
    ['Page style…', 'format-page'], null, ['Clear direct formatting', 'clear-format', 'Ctrl+M']
  ],
  Styles: [['Default paragraph style', 'style-default'], ['Heading 1', 'style-h1'], ['Heading 2', 'style-h2'], ['Manage styles', 'manage-styles', 'F11']],
  Table: [['Insert table…', 'insert-table'], ['Insert row above', 'insert-row'], ['Insert column before', 'insert-column'], ['Merge cells', 'merge-cells'], ['Split cells…', 'split-cells']],
  Form: [['Design mode', 'form-design'], ['Text box', 'insert-text'], ['Check box', 'insert-checkbox'], ['Push button', 'insert-button']],
  Sheet: [['Insert rows above', 'insert-row'], ['Insert columns before', 'insert-column'], ['Delete rows', 'delete-row'], ['Named ranges…', 'named-ranges']],
  Data: [['Sort…', 'sort-data'], ['AutoFilter', 'filter-data', 'Ctrl+Shift+L'], ['Standard filter…', 'filter-data'], ['Pivot table…', 'pivot-table'], ['Group and outline', 'group-data']],
  Slide: [['New slide', 'slide-add', 'Ctrl+M'], ['Duplicate slide', 'slide-duplicate'], ['Delete slide', 'slide-delete'], ['Slide properties…', 'slide-properties'], ['Slide layout', 'slide-layout']],
  'Slide Show': [['Start from first slide', 'present', 'F5'], ['Start from current slide', 'present-current', 'Shift+F5'], ['Slide show settings…', 'present-settings']],
  Page: [['Page properties…', 'page-properties'], ['Insert page', 'draw-add-page'], ['Rename page…', 'draw-rename-page']],
  Shape: [['Rotate or flip', 'shape-rotate'], ['Arrange', 'shape-arrange'], ['Group', 'shape-group'], ['Delete selected', 'draw-delete']],
  Tools: [['Spelling…', 'spelling', 'F7'], ['Word count…', 'word-count'], ['AutoCorrect options…', 'autocorrect'], ['Macros', 'libreoffice-macros'], ['Options…', 'navigate-settings', 'Alt+F12']],
  Window: [['New window', 'new-window'], ['Close window', 'close-window']],
  Help: [['Material Office help', 'help', 'F1'], ["What's this?", 'whats-this'], ['About Material Office', 'about']]
};

export const STANDARD_TOOLBAR = [
  ['＋', 'New', 'new-document'], ['▱', 'Open', 'open-file'], ['▣', 'Save', 'save-document'], ['PDF', 'Export PDF', 'export-pdf'],
  ['⌁', 'Print', 'print'], null, ['↶', 'Undo', 'undo'], ['↷', 'Redo', 'redo'], null, ['✂', 'Cut', 'cut'],
  ['⧉', 'Copy', 'copy'], ['▤', 'Paste', 'paste'], null, ['⌕', 'Find', 'find-replace'], ['✓', 'Spelling', 'spelling']
];

export const FORMAT_TOOLBAR = {
  writer: [
    ['select', 'paragraph-style', 'Default paragraph style'], ['select', 'font-family', 'Aptos'], ['select', 'font-size', '12'], null,
    ['button', 'bold', 'B'], ['button', 'italic', 'I'], ['button', 'underline', 'U'], ['button', 'strike', 'S'], null,
    ['button', 'align-left', '≡'], ['button', 'align-center', '≣'], ['button', 'align-right', '☷'], ['button', 'justify', '▤'], null,
    ['button', 'list-bullets', '•'], ['button', 'list-numbers', '1.']
  ],
  calc: [
    ['select', 'font-family', 'Segoe UI'], ['select', 'font-size', '10'], null, ['button', 'bold', 'B'], ['button', 'italic', 'I'],
    ['button', 'underline', 'U'], null, ['button', 'align-left', '≡'], ['button', 'align-center', '≣'], ['button', 'align-right', '☷'],
    null, ['button', 'format-currency', '$'], ['button', 'format-percent', '%'], ['button', 'merge-cells', '⇔']
  ],
  impress: [
    ['select', 'font-family', 'Aptos Display'], ['select', 'font-size', '24'], null, ['button', 'bold', 'B'], ['button', 'italic', 'I'],
    ['button', 'align-left', '≡'], ['button', 'align-center', '≣'], ['button', 'align-right', '☷'], null, ['button', 'slide-add', '＋'], ['button', 'present', '▶']
  ],
  draw: [['button', 'draw-select', '↖'], ['button', 'draw-rect', '□'], ['button', 'draw-ellipse', '○'], ['button', 'draw-line', '╱'], ['button', 'draw-text', 'T'], null, ['button', 'draw-delete', '⌫']],
  base: [['button', 'base-add-record', '＋'], ['button', 'base-delete-record', '⌫'], null, ['button', 'sort-data', '⇅'], ['button', 'filter-data', '▽'], ['button', 'base-export-csv', 'CSV']],
  math: [['button', 'math-insert', '∑'], null, ['button', 'zoom-in', '＋'], ['button', 'zoom-out', '−'], ['button', 'math-update', '↻']]
};

export const CREATE_TEMPLATES = [
  { type: 'writer', label: 'Writer document', yueLabel: 'Writer 文件', subtitle: 'Reports, letters, long-form writing', yueSubtitle: '報告、信件同長篇寫作', glyph: '▤' },
  { type: 'calc', label: 'Calc spreadsheet', yueLabel: 'Calc 試算表', subtitle: 'Tables, formulas, budgets', yueSubtitle: '表格、方程式同預算', glyph: '▦' },
  { type: 'impress', label: 'Impress presentation', yueLabel: 'Impress 簡報', subtitle: 'Slides and speaker notes', yueSubtitle: '投影片同講者備註', glyph: '▣' },
  { type: 'draw', label: 'Draw canvas', yueLabel: 'Draw 畫布', subtitle: 'Shapes, diagrams, visual plans', yueSubtitle: '圖形、圖表同視覺計劃', glyph: '◇' },
  { type: 'base', label: 'Base records', yueLabel: 'Base 記錄', subtitle: 'Local tables and queries', yueSubtitle: '本機資料表同查詢', glyph: '◫' },
  { type: 'math', label: 'Math formula', yueLabel: 'Math 方程式', subtitle: 'Equations and symbols', yueSubtitle: '方程式同符號', glyph: '∑' }
];

export const DEFAULT_WRITER_HTML = `
  <h1>Q3 Board Report</h1>
  <p><strong>Prepared for the Board of Directors · Confidential</strong></p>
  <h2>Executive summary</h2>
  <p>Revenue grew 18% quarter over quarter, driven by strong adoption across the enterprise segment and disciplined expansion of the direct sales team.</p>
  <p>Select this page and start typing. Formatting, autosave, history, export, and LibreOffice hand-off are connected to the document workspace.</p>`;

export const DEFAULT_CALC_CELLS = {
  A1: 'Category', B1: 'Jan', C1: 'Feb', D1: 'Mar', E1: 'Quarter',
  A2: 'Subscriptions', B2: '4200', C2: '4780', D2: '5120', E2: '=SUM(B2:D2)',
  A3: 'Services', B3: '1300', C3: '1580', D3: '1690', E3: '=SUM(B3:D3)',
  A4: 'Total', B4: '=SUM(B2:B3)', C4: '=SUM(C2:C3)', D4: '=SUM(D2:D3)', E4: '=SUM(E2:E3)',
  A6: 'Growth', B6: '0.11', C6: '0.14', D6: '0.18', E6: '=AVERAGE(B6:D6)'
};

export const DEFAULT_SLIDES = [
  { id: 'slide-1', layout: 'title', title: 'Material Office', body: 'A focused Windows workspace powered by LibreOffice' },
  { id: 'slide-2', layout: 'content', title: 'One lively shell', body: 'Documents, commands, history, and appearance stay together.' },
  { id: 'slide-3', layout: 'content', title: 'Truthful integration', body: 'LibreOffice handles authoritative format conversion and native editing.' }
];

export const DEFAULT_BASE_ROWS = [
  { id: 'C-001', name: 'Northwind Studio', contact: 'Priya Shah', status: 'Active', value: '12800' },
  { id: 'C-002', name: 'Harbour Systems', contact: 'Alex Rivera', status: 'Active', value: '9400' },
  { id: 'C-003', name: 'Maple & Finch', contact: 'Mina Wong', status: 'Lead', value: '6200' },
  { id: 'C-004', name: 'Signal Works', contact: 'Noah Chen', status: 'Paused', value: '5100' }
];

export const DEFAULT_DRAW_SHAPES = [
  { id: 'shape-1', type: 'rect', x: 130, y: 120, width: 230, height: 150, fill: '#eaddff', stroke: '#6750a4', strokeWidth: 2 },
  { id: 'shape-2', type: 'ellipse', x: 530, y: 280, width: 180, height: 120, fill: '#ffd8e4', stroke: '#7d5260', strokeWidth: 2 },
  { id: 'shape-3', type: 'text', x: 205, y: 350, text: 'Material Office', fill: '#1d1b20', stroke: 'none', strokeWidth: 0 }
];

export const MATH_SYMBOLS = ['+', '−', '×', '÷', '=', '≠', '≤', '≥', '±', '∞', '√', '∑', '∏', '∫', 'α', 'β', 'γ', 'δ', 'π', 'θ'];

export const RELEASE_INFO = {
  version: '0.1.0',
  buildDate: '2026-07-31',
  releasedAt: '2026-07-31',
  status: 'released',
  codeName: 'Classic Har Gow · 蝦餃',
  image: './assets/dim-sum/hk-dish-0001-classic-har-gow.png',
  alt: 'Warm tea-house photograph of Classic Har Gow · 港式茶樓木枱上嘅蝦餃'
};

export const CHANGELOG = [
  {
    version: '0.1.0', date: RELEASE_INFO.releasedAt, buildDate: RELEASE_INFO.buildDate, status: RELEASE_INFO.status, codeName: RELEASE_INFO.codeName,
    sections: {
      Added: ['Windows Electron workspace with eleven functional product surfaces', 'LibreOffice discovery, conversion, launch, and capability reporting', 'Persisted tabs, groups, settings, notifications, and local version history'],
      Accessibility: ['Keyboard navigation, visible focus, reduced-motion support, and bilingual-width layouts'],
      Security: ['Sandboxed renderer, context isolation, validated IPC, restrictive content security policy, and no remote assets']
    },
    sectionsYue: {
      Added: ['Windows Electron 工作間，提供十一個可用產品畫面', 'LibreOffice 偵測、轉換、啟動同功能狀態報告', '保存分頁、群組、設定、通知同本機版本紀錄'],
      Accessibility: ['鍵盤導覽、清楚焦點、減少動態效果同雙語寬度版面'],
      Security: ['沙箱 renderer、context isolation、已驗證 IPC、嚴格內容安全政策，同埋冇遠端資產']
    }
  }
];

export function surfaceById(id) {
  return APP_SURFACES.find((surface) => surface.id === id) ?? APP_SURFACES[0];
}
