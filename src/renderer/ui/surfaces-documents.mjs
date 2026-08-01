import { DEFAULT_BASE_ROWS, DEFAULT_CALC_CELLS, DEFAULT_DRAW_SHAPES, DEFAULT_SLIDES, DEFAULT_WRITER_HTML, MATH_SYMBOLS } from './catalog.mjs';
import { escapeAttribute, escapeHtml, renderMenuBar, renderStatusBar, renderToolbar } from './helpers.mjs';

function localized(ctx, english, cantonese, facts = {}) {
  if (ctx.l) return ctx.l(english, cantonese, facts);
  return english.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (token, name) => Object.hasOwn(facts, name) ? String(facts[name]) : token);
}

function editorFrame(ctx, surface, body, status = []) {
  const openMenu = ctx.state.runtime?.openMenu;
  return `<section class="surface editor-surface" aria-label="${escapeAttribute(localized(ctx, '{surface} editor', '{surface} 編輯器', { surface }))}" data-surface="${surface}" data-appearance-id="surface:${surface}">
    <div>${renderMenuBar(surface, openMenu, ctx)}${renderToolbar(surface, ctx.state, ctx)}</div>
    <div class="sr-only" aria-live="polite">${escapeHtml(ctx.state.runtime?.statusMessage ?? '')}</div>
    ${body}
    ${renderStatusBar(ctx, status)}
  </section>`;
}

function renderProperties(ctx, surface) {
  const { t } = ctx;
  if (ctx.state.preferences?.propertiesPanel === false) return '';
  const lineHeight = Math.max(1, Math.min(2.5, Number(ctx.document?.content?.lineHeight ?? 1.5)));
  return `<aside class="properties-panel" aria-label="${escapeAttribute(t('panel.properties'))}" data-appearance-id="properties:${surface}">
    <h2>${escapeHtml(t('panel.properties'))}</h2>
    <div class="property-group"><h3>${escapeHtml(t('property.character'))}</h3>
      <div class="field"><span>${escapeHtml(t('property.font'))}</span><select data-action="font-family"><option>Segoe UI</option><option>Aptos</option><option>Georgia</option><option>Consolas</option></select></div>
      <div class="demo-row"><button class="toolbar-button" data-action="bold" aria-label="${escapeAttribute(localized(ctx, 'Bold', '粗體'))}">B</button><button class="toolbar-button" data-action="italic" aria-label="${escapeAttribute(localized(ctx, 'Italic', '斜體'))}">I</button><button class="toolbar-button" data-action="underline" aria-label="${escapeAttribute(localized(ctx, 'Underline', '底線'))}">U</button></div>
    </div>
    <div class="property-group"><h3>${escapeHtml(t('property.paragraph'))}</h3>
      <div class="demo-row"><button class="toolbar-button" data-action="align-left" aria-label="${escapeAttribute(localized(ctx, 'Align left', '靠左對齊'))}">≡</button><button class="toolbar-button" data-action="align-center" aria-label="${escapeAttribute(localized(ctx, 'Align center', '置中對齊'))}">≣</button><button class="toolbar-button" data-action="align-right" aria-label="${escapeAttribute(localized(ctx, 'Align right', '靠右對齊'))}">☷</button></div>
      <label class="field"><span>${escapeHtml(t('property.spacing'))}</span><input type="range" min="1" max="2.5" step="0.1" value="${lineHeight}" data-action="line-height"><output>${lineHeight}</output></label>
    </div>
    <div class="property-group"><h3>${escapeHtml(t('property.integration'))}</h3>
      <p style="font-size:.78rem;line-height:1.45;color:var(--on-surface-variant)">${escapeHtml(ctx.libreOffice?.available ? t('libreoffice.available') : t('libreoffice.unavailable'))}</p>
      <button class="button-label outlined" type="button" data-action="edit-libreoffice">${escapeHtml(t('action.editLibreOffice'))}</button>
    </div>
  </aside>`;
}

export function renderWriter(ctx) {
  const document = ctx.document ?? { title: 'Untitled Writer document', content: { html: DEFAULT_WRITER_HTML } };
  const html = ctx.sanitizeRichHtml(document.content?.html ?? DEFAULT_WRITER_HTML);
  const words = ctx.countWords(document.content?.html ?? '');
  const lineHeight = Math.max(1, Math.min(2.5, Number(document.content?.lineHeight ?? 1.5)));
  const body = `<div class="editor-body">
    <div class="editor-canvas" data-writer-view="${escapeAttribute(ctx.state.preferences?.writerView ?? 'normal')}"><article class="writer-page" contenteditable="true" spellcheck="true" data-editor="writer" data-document-id="${escapeAttribute(document.id ?? '')}" aria-label="${escapeAttribute(localized(ctx, 'Writer document content', 'Writer 文件內容'))}" style="line-height:${lineHeight}">${html}</article></div>
    ${renderProperties(ctx, 'writer')}
  </div>`;
  return editorFrame(ctx, 'writer', body, [localized(ctx, 'Page 1', '第 1 頁'), `${words} ${ctx.t('status.words')}`, document.title ?? localized(ctx, 'Untitled', '未命名')]);
}

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function renderCalc(ctx) {
  const document = ctx.document ?? { title: 'Untitled spreadsheet', content: {} };
  const sheets = document.content?.sheets?.length ? document.content.sheets : [{ id: 'sheet-1', name: 'Income', cells: DEFAULT_CALC_CELLS }];
  const activeSheetId = document.content?.activeSheetId ?? sheets[0].id;
  const sheet = sheets.find((candidate) => candidate.id === activeSheetId) ?? sheets[0];
  const selected = ctx.state.runtime?.calcSelected ?? 'A1';
  const selectedRaw = sheet.cells?.[selected] ?? '';
  const cols = 10;
  const rows = 20;
  const header = Array.from({ length: cols }, (_, index) => `<th scope="col">${columnName(index)}</th>`).join('');
  const bodyRows = Array.from({ length: rows }, (_, rowIndex) => {
    const row = rowIndex + 1;
    const cells = Array.from({ length: cols }, (_, colIndex) => {
      const address = `${columnName(colIndex)}${row}`;
      const raw = sheet.cells?.[address] ?? '';
      const display = ctx.evaluateSpreadsheetCell(address, sheet.cells ?? {});
      return `<td contenteditable="true" spellcheck="false" data-cell="${address}" data-sheet-id="${escapeAttribute(sheet.id)}" class="${selected === address ? 'selected' : ''}" aria-label="${escapeAttribute(localized(ctx, 'Cell {address}', '儲存格 {address}', { address }))}" title="${escapeAttribute(raw)}">${escapeHtml(display)}</td>`;
    }).join('');
    return `<tr><th scope="row">${row}</th>${cells}</tr>`;
  }).join('');
  const calcBody = `<div class="editor-body" style="grid-template-columns:1fr"><div class="calc-shell">
    <div class="formula-bar"><input value="${escapeAttribute(selected)}" data-action="calc-address" aria-label="${escapeAttribute(localized(ctx, 'Cell address', '儲存格地址'))}"><button class="toolbar-button" data-action="calc-function" aria-label="${escapeAttribute(localized(ctx, 'Function wizard', '函數精靈'))}">fx</button><input value="${escapeAttribute(selectedRaw)}" data-action="calc-formula" aria-label="${escapeAttribute(localized(ctx, 'Formula input', '方程式輸入'))}"></div>
    <div class="calc-grid-wrap" id="calc-sheet-panel-${escapeAttribute(sheet.id)}" role="tabpanel" aria-labelledby="calc-sheet-tab-${escapeAttribute(sheet.id)}" tabindex="0"><table class="calc-grid" aria-label="${escapeAttribute(localized(ctx, 'Spreadsheet', '試算表'))}"><thead><tr><th aria-label="${escapeAttribute(localized(ctx, 'Select all cells', '選取所有儲存格'))}"></th>${header}</tr></thead><tbody>${bodyRows}</tbody></table></div>
    <div class="sheet-tab-controls"><div class="sheet-tabs" role="tablist" aria-label="${escapeAttribute(localized(ctx, 'Sheets', '工作表'))}">${sheets.map((candidate) => `<button class="sheet-tab" id="calc-sheet-tab-${escapeAttribute(candidate.id)}" role="tab" tabindex="${candidate.id === sheet.id ? '0' : '-1'}" aria-selected="${candidate.id === sheet.id}" aria-controls="calc-sheet-panel-${escapeAttribute(candidate.id)}" data-action="calc-sheet" data-sheet-id="${escapeAttribute(candidate.id)}">${escapeHtml(candidate.name)}</button>`).join('')}</div><button class="icon-button" data-action="calc-add-sheet" aria-label="${escapeAttribute(localized(ctx, 'Add sheet', '新增工作表'))}">＋</button></div>
  </div></div>`;
  return editorFrame(ctx, 'calc', calcBody, [`${sheets.length} ${ctx.t('status.sheets')}`, selected, document.title ?? 'Untitled']);
}

function renderSlide(ctx, slide, active, index) {
  return `<button class="slide-thumb" type="button" data-action="slide-select" data-slide-id="${escapeAttribute(slide.id)}" aria-current="${active ? 'true' : 'false'}" aria-label="${escapeAttribute(localized(ctx, 'Slide {number}: {title}', '投影片 {number}：{title}', { number: index + 1, title: slide.title }))}"><span>${index + 1}. ${escapeHtml(slide.title)}</span></button>`;
}

export function renderImpress(ctx) {
  const document = ctx.document ?? { title: 'Untitled presentation', content: {} };
  const slides = document.content?.slides?.length ? document.content.slides : DEFAULT_SLIDES;
  const activeId = document.content?.activeSlideId ?? slides[0].id;
  const active = slides.find((slide) => slide.id === activeId) ?? slides[0];
  const body = `<div class="editor-body" style="grid-template-columns:1fr"><div class="impress-workspace">
    <aside class="slide-rail" aria-label="${escapeAttribute(localized(ctx, 'Slides', '投影片'))}"><button class="button-label tonal" style="width:100%;margin-bottom:12px" data-action="slide-add">＋ ${escapeHtml(ctx.t('slide.new'))}</button>${slides.map((slide, index) => renderSlide(ctx, slide, slide.id === active.id, index)).join('')}</aside>
    <div class="slide-stage"><article class="slide-canvas" data-slide-id="${escapeAttribute(active.id)}"><h2 contenteditable="true" data-slide-field="title">${escapeHtml(active.title)}</h2><p contenteditable="true" data-slide-field="body">${escapeHtml(active.body)}</p></article></div>
    <aside class="properties-panel" aria-label="${escapeAttribute(localized(ctx, 'Slide layouts', '投影片版面配置'))}"><h2>${escapeHtml(ctx.t('slide.layouts'))}</h2><div class="card-grid" style="grid-template-columns:repeat(2,1fr)">${[['title', 'Title', '標題'], ['content', 'Content', '內容'], ['two-column', 'Two columns', '雙欄'], ['blank', 'Blank', '空白']].map(([layout, en, yue]) => `<button class="card" style="aspect-ratio:4/3;padding:8px" data-action="slide-layout" data-layout="${layout}" aria-pressed="${active.layout === layout}">${escapeHtml(localized(ctx, en, yue))}</button>`).join('')}</div><div class="property-group"><button class="button-label filled" data-action="present">▶ ${escapeHtml(ctx.t('slide.present'))}</button></div></aside>
  </div></div>`;
  return editorFrame(ctx, 'impress', body, [`${ctx.t('status.slide')} ${slides.indexOf(active) + 1} / ${slides.length}`, document.title ?? 'Untitled']);
}

function drawShapeMarkup(ctx, shape, { selected = false, index = 0 } = {}) {
  const typeName = ({ rect: localized(ctx, 'Rectangle', '矩形'), ellipse: localized(ctx, 'Ellipse', '橢圓形'), line: localized(ctx, 'Line', '線條'), text: localized(ctx, 'Text', '文字') })[shape.type] ?? localized(ctx, 'Shape', '圖形');
  const textName = shape.type === 'text' && shape.text ? `: ${shape.text}` : '';
  const label = localized(ctx, '{type} {number}{text}, x {x}, y {y}', '{type} {number}{text}，x {x}，y {y}', { type: typeName, number: index + 1, text: textName, x: Number(shape.x ?? 0), y: Number(shape.y ?? 0) });
  const common = `class="draw-object${selected ? ' selected' : ''}" data-shape-id="${escapeAttribute(shape.id)}" data-shape-type="${escapeAttribute(shape.type ?? 'rect')}" tabindex="0" focusable="true" role="button" aria-pressed="${selected}" aria-label="${escapeAttribute(label)}" aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Delete Backspace Control+D" fill="${escapeAttribute(shape.fill ?? '#eaddff')}" stroke="${escapeAttribute(shape.stroke ?? '#6750a4')}" stroke-width="${Number(shape.strokeWidth ?? 2)}"`;
  if (shape.type === 'ellipse') return `<ellipse ${common} cx="${Number(shape.x ?? 200)}" cy="${Number(shape.y ?? 160)}" rx="${Number(shape.width ?? 110) / 2}" ry="${Number(shape.height ?? 80) / 2}"></ellipse>`;
  if (shape.type === 'line') return `<line ${common} x1="${Number(shape.x ?? 140)}" y1="${Number(shape.y ?? 140)}" x2="${Number(shape.x ?? 140) + Number(shape.width ?? 180)}" y2="${Number(shape.y ?? 140) + Number(shape.height ?? 90)}"></line>`;
  if (shape.type === 'text') return `<text ${common} x="${Number(shape.x ?? 180)}" y="${Number(shape.y ?? 180)}" font-size="${Number(shape.fontSize ?? 28)}">${escapeHtml(shape.text ?? 'Text')}</text>`;
  return `<rect ${common} x="${Number(shape.x ?? 160)}" y="${Number(shape.y ?? 120)}" width="${Number(shape.width ?? 180)}" height="${Number(shape.height ?? 110)}" rx="${Number(shape.radius ?? 16)}"></rect>`;
}

export function renderDraw(ctx) {
  const document = ctx.document ?? { title: 'Untitled drawing', content: {} };
  const shapes = Array.isArray(document.content?.shapes) ? document.content.shapes : DEFAULT_DRAW_SHAPES;
  const tool = ctx.state.runtime?.drawTool ?? 'select';
  const selected = ctx.state.runtime?.selectedShape;
  const selectedShape = shapes.find((shape) => shape.id === selected);
  const selectedFill = selectedShape?.fill && /^#[0-9a-f]{6}$/i.test(selectedShape.fill) ? selectedShape.fill : '#6750a4';
  const selectedStrokeWidth = Math.max(0, Math.min(12, Number(selectedShape?.strokeWidth ?? 2)));
  const body = `<div class="editor-body" style="grid-template-columns:1fr"><div class="draw-workspace">
    <div class="draw-tools" role="toolbar" aria-label="${escapeAttribute(localized(ctx, 'Drawing tools', '繪圖工具'))}">${[['select', '↖', 'Select', '選取'], ['rect', '□', 'Rectangle', '矩形'], ['ellipse', '○', 'Ellipse', '橢圓形'], ['line', '╱', 'Line', '線條'], ['text', 'T', 'Text', '文字']].map(([id, glyph, en, yue]) => `<button class="toolbar-button" data-action="draw-tool" data-tool="${id}" aria-pressed="${tool === id}" aria-label="${escapeAttribute(localized(ctx, en, yue))}">${glyph}</button>`).join('')}<button class="toolbar-button" data-action="draw-delete" aria-label="${escapeAttribute(localized(ctx, 'Delete selected', '刪除已選物件'))}">⌫</button></div>
    <div class="draw-canvas-wrap"><svg class="draw-canvas" viewBox="0 0 960 600" role="group" aria-label="${escapeAttribute(localized(ctx, 'Drawing canvas', '繪圖畫布'))}" aria-describedby="draw-canvas-help" data-draw-canvas="true"><desc id="draw-canvas-help">${escapeHtml(localized(ctx, 'Tab to a shape. Press Enter or Space to select it, arrow keys to move it, Delete to remove it, or Control+D to duplicate it.', '按 Tab 移到圖形。按 Enter 或空白鍵選取，用方向鍵移動，Delete 刪除，或者 Control+D 複製。'))}</desc>${shapes.map((shape, index) => drawShapeMarkup(ctx, shape, { selected: selected === shape.id, index })).join('')}</svg></div>
    <aside class="properties-panel" aria-label="${escapeAttribute(ctx.t('panel.properties'))}"><h2>${escapeHtml(ctx.t('panel.properties'))}</h2><label class="field"><span>${escapeHtml(localized(ctx, 'Fill', '填色'))}</span><input type="color" value="${escapeAttribute(selectedFill)}" data-action="draw-fill" ${selectedShape ? '' : 'disabled'}></label><label class="field"><span>${escapeHtml(localized(ctx, 'Line width', '線條闊度'))}</span><input type="range" min="0" max="12" value="${selectedStrokeWidth}" data-action="draw-stroke-width" aria-label="${escapeAttribute(localized(ctx, 'Selected shape line width', '已選圖形線條闊度'))}" ${selectedShape ? '' : 'disabled'}><output>${selectedStrokeWidth}</output></label><button class="button-label outlined" data-action="draw-duplicate" aria-keyshortcuts="Control+D" ${selectedShape ? '' : 'disabled'}>${escapeHtml(ctx.t('action.duplicate'))}</button></aside>
  </div></div>`;
  return editorFrame(ctx, 'draw', body, [`${shapes.length} ${ctx.t('status.objects')}`, selected ? ctx.t('status.selected') : ctx.t('status.noneSelected'), document.title ?? 'Untitled']);
}

export function renderBase(ctx) {
  const document = ctx.document ?? { title: 'Untitled records', content: {} };
  const rows = Array.isArray(document.content?.rows) ? document.content.rows : DEFAULT_BASE_ROWS;
  const section = ctx.state.runtime?.baseSection ?? 'Tables';
  const searched = ctx.filterCollection(
    rows,
    ctx.state.searches?.base ?? {},
    (row) => Object.values(row).join(' ')
  );
  const query = ctx.state.runtime?.baseQuery ?? { field: 'name', operator: 'contains', value: '', active: false };
  const queryRows = !query.active || !query.value ? searched : searched.filter((row) => {
    const actual = String(row[query.field] ?? '');
    const expected = String(query.value ?? '');
    if (query.operator === 'equals') return actual.localeCompare(expected, undefined, { sensitivity: 'accent' }) === 0;
    if (query.operator === 'starts') return actual.toLocaleLowerCase().startsWith(expected.toLocaleLowerCase());
    if (query.operator === 'greater' || query.operator === 'less') {
      const left = Number(actual.replace(/[^0-9+.-]/g, '')); const right = Number(expected.replace(/[^0-9+.-]/g, ''));
      return Number.isFinite(left) && Number.isFinite(right) && (query.operator === 'greater' ? left > right : left < right);
    }
    return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  });
  const selected = rows.find((row) => row.id === ctx.state.runtime?.selectedBaseRecord) ?? rows[0];
  const draft = ctx.state.runtime?.baseFormDraft && ctx.state.runtime.baseFormRecordId === selected?.id ? ctx.state.runtime.baseFormDraft : selected ?? {};
  const statusCounts = [...new Set(rows.map((row) => String(row.status || 'Unspecified')))].map((status) => ({ status, count: rows.filter((row) => String(row.status || 'Unspecified') === status).length }));
  const totalValue = rows.reduce((sum, row) => { const value = Number(String(row.value ?? '').replace(/[^0-9+.-]/g, '')); return sum + (Number.isFinite(value) ? value : 0); }, 0);
  const editableTable = (items, editable) => `<table class="data-table" aria-label="${escapeAttribute(editable ? localized(ctx, 'Database records', '資料庫記錄') : localized(ctx, 'Query results', '查詢結果'))}"><thead><tr><th>ID</th><th>${escapeHtml(localized(ctx, 'Name', '名稱'))}</th><th>${escapeHtml(localized(ctx, 'Contact', '聯絡人'))}</th><th>${escapeHtml(localized(ctx, 'Status', '狀態'))}</th><th>${escapeHtml(localized(ctx, 'Value', '數值'))}</th>${editable ? `<th><span class="sr-only">${escapeHtml(localized(ctx, 'Actions', '操作'))}</span></th>` : ''}</tr></thead><tbody>${items.map((row) => `<tr data-record-id="${escapeAttribute(row.id)}" ${editable ? '' : `data-action="base-select-record" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="${escapeAttribute(localized(ctx, 'Open record {id}: {name}', '開啟記錄 {id}：{name}', { id: row.id, name: row.name }))}" aria-selected="${selected?.id === row.id}"`} class="${selected?.id === row.id ? 'selected' : ''}"><td>${escapeHtml(row.id)}</td><td ${editable ? 'contenteditable="true" data-record-field="name"' : ''}>${escapeHtml(row.name)}</td><td ${editable ? 'contenteditable="true" data-record-field="contact"' : ''}>${escapeHtml(row.contact)}</td><td ${editable ? 'contenteditable="true" data-record-field="status"' : ''}>${escapeHtml(row.status)}</td><td ${editable ? 'contenteditable="true" data-record-field="value"' : ''}>${escapeHtml(row.value)}</td>${editable ? `<td><button class="icon-button" data-action="base-delete-record" data-record-id="${escapeAttribute(row.id)}" aria-label="${escapeAttribute(localized(ctx, 'Delete {name}', '刪除 {name}', { name: row.name }))}">⌫</button></td>` : ''}</tr>`).join('')}</tbody></table>`;
  let content;
  if (section === 'Queries') {
    const fieldLabels = { name: localized(ctx, 'Name', '名稱'), contact: localized(ctx, 'Contact', '聯絡人'), status: localized(ctx, 'Status', '狀態'), value: localized(ctx, 'Value', '數值') };
    const operatorLabels = { contains: localized(ctx, 'contains', '包含'), equals: localized(ctx, 'equals', '等於'), starts: localized(ctx, 'starts with', '開頭係'), greater: localized(ctx, 'greater than', '大過'), less: localized(ctx, 'less than', '細過') };
    content = `<div class="setting-section" style="margin:0 0 16px"><div class="appearance-controls"><label class="field"><span>${escapeHtml(localized(ctx, 'Field', '欄位'))}</span><select data-action="base-query-field">${['name', 'contact', 'status', 'value'].map((field) => `<option value="${field}" ${query.field === field ? 'selected' : ''}>${escapeHtml(fieldLabels[field])}</option>`).join('')}</select></label><label class="field"><span>${escapeHtml(localized(ctx, 'Operator', '運算條件'))}</span><select data-action="base-query-operator">${['contains', 'equals', 'starts', 'greater', 'less'].map((operator) => `<option value="${operator}" ${query.operator === operator ? 'selected' : ''}>${escapeHtml(operatorLabels[operator])}</option>`).join('')}</select></label><label class="field wide"><span>${escapeHtml(localized(ctx, 'Value', '數值'))}</span><input data-action="base-query-value" value="${escapeAttribute(query.value)}" maxlength="500"></label></div><div class="dialog-actions" style="padding:0"><button class="button-label text" data-action="base-query-clear">${escapeHtml(localized(ctx, 'Clear', '清除'))}</button><button class="button-label filled" data-action="base-query-run">${escapeHtml(localized(ctx, 'Run query', '執行查詢'))}</button></div></div><p class="appearance-status" aria-live="polite">${escapeHtml(query.active ? localized(ctx, '{matches} of {total} searched records match this query.', '已搜尋嘅 {total} 筆記錄入面有 {matches} 筆符合查詢。', { matches: queryRows.length, total: searched.length }) : localized(ctx, 'Choose a field, operator, and value, then run the query.', '揀欄位、運算條件同數值，然後執行查詢。'))}</p>${editableTable(queryRows, false)}`;
  } else if (section === 'Forms') {
    const formFields = { name: localized(ctx, 'Name', '名稱'), contact: localized(ctx, 'Contact', '聯絡人'), status: localized(ctx, 'Status', '狀態'), value: localized(ctx, 'Value', '數值') };
    content = selected ? `<form class="setting-section" data-base-form onsubmit="return false"><p class="eyebrow">${escapeHtml(localized(ctx, 'Record {id}', '記錄 {id}', { id: selected.id }))}</p><div class="appearance-controls">${['name', 'contact', 'status', 'value'].map((field) => `<label class="field"><span>${escapeHtml(formFields[field])}</span><input data-action="base-form-field" data-field="${field}" value="${escapeAttribute(draft[field] ?? '')}" maxlength="10000"></label>`).join('')}</div><div class="dialog-actions" style="padding:12px 0 0"><button class="button-label outlined" type="button" data-action="base-form-new">${escapeHtml(localized(ctx, 'New record', '新增記錄'))}</button><button class="button-label filled" type="button" data-action="base-form-save">${escapeHtml(localized(ctx, 'Save record', '儲存記錄'))}</button></div></form>` : `<div class="empty-state"><span class="empty-glyph" aria-hidden="true">▤</span><h2>${escapeHtml(localized(ctx, 'No records yet', '仲未有記錄'))}</h2><p>${escapeHtml(localized(ctx, 'Create a record to begin using the form.', '建立一筆記錄就可以開始用表單。'))}</p><button class="button-label filled" type="button" data-action="base-form-new">${escapeHtml(localized(ctx, 'New record', '新增記錄'))}</button></div>`;
  } else if (section === 'Reports') {
    content = `<div class="card-grid"><article class="card"><div class="card-body"><p class="eyebrow">${escapeHtml(localized(ctx, 'Rows', '列數'))}</p><h2>${rows.length}</h2><p>${escapeHtml(localized(ctx, 'Current records in the active local table.', '目前本機資料表入面嘅記錄。'))}</p></div></article><article class="card"><div class="card-body"><p class="eyebrow">${escapeHtml(localized(ctx, 'Numeric total', '數值總和'))}</p><h2>${escapeHtml(new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(totalValue))}</h2><p>${escapeHtml(localized(ctx, 'Sum of numeric values after non-numeric labels are ignored.', '忽略非數字標籤之後嘅數值總和。'))}</p></div></article></div><div class="setting-section" style="margin-top:16px"><h2>${escapeHtml(localized(ctx, 'Status breakdown', '狀態分佈'))}</h2><table class="data-table"><thead><tr><th>${escapeHtml(localized(ctx, 'Status', '狀態'))}</th><th>${escapeHtml(localized(ctx, 'Records', '記錄'))}</th></tr></thead><tbody>${statusCounts.map(({ status, count }) => `<tr><td>${escapeHtml(status)}</td><td>${count}</td></tr>`).join('')}</tbody></table><div class="dialog-actions" style="padding:14px 0 0"><button class="button-label filled" data-action="base-export-report">${escapeHtml(localized(ctx, 'Export report', '匯出報告'))}</button></div></div>`;
  } else {
    content = editableTable(searched, true);
  }
  const body = `<div class="editor-body" style="grid-template-columns:1fr"><div class="base-layout">
    <nav class="surface-nav" aria-label="${escapeAttribute(localized(ctx, 'Database objects', '資料庫物件'))}">${[['Tables', 'Tables', '資料表'], ['Queries', 'Queries', '查詢'], ['Forms', 'Forms', '表單'], ['Reports', 'Reports', '報告']].map(([value, en, yue]) => `<button class="nav-item" data-action="base-section" data-section="${value}" aria-current="${section === value}"><span aria-hidden="true">${value === 'Tables' ? '▦' : value === 'Queries' ? '⌕' : value === 'Forms' ? '▤' : '▥'}</span>${escapeHtml(localized(ctx, en, yue))}</button>`).join('')}</nav>
    <div class="data-pane"><div class="section-heading"><h2>${escapeHtml(({ Tables: localized(ctx, 'Tables', '資料表'), Queries: localized(ctx, 'Queries', '查詢'), Forms: localized(ctx, 'Forms', '表單'), Reports: localized(ctx, 'Reports', '報告') })[section] ?? section)}</h2><div style="min-width:260px">${ctx.renderSearchBox({ id: 'base', value: ctx.state.searches?.base?.query, placeholder: ctx.t('search.records'), label: ctx.t('search.records'), regexState: ctx.state.searches?.base, localize: ctx.l })}</div>${section === 'Tables' ? `<button class="button-label filled" data-action="base-add-record">＋ ${escapeHtml(ctx.t('action.add'))}</button>` : ''}</div>${content}
    </div>
    <aside class="detail-pane"><h2>${escapeHtml(ctx.t('base.tools'))}</h2><p>${escapeHtml(ctx.t('base.description'))}</p><div class="property-group"><button class="button-label outlined" data-action="base-import-csv">${escapeHtml(ctx.t('action.importCsv'))}</button><button class="button-label outlined" data-action="base-export-csv" style="margin-top:8px">${escapeHtml(ctx.t('action.exportCsv'))}</button></div></aside>
  </div></div>`;
  return editorFrame(ctx, 'base', body, [`${searched.length} ${ctx.t('status.records')}`, ({ Tables: localized(ctx, 'Tables', '資料表'), Queries: localized(ctx, 'Queries', '查詢'), Forms: localized(ctx, 'Forms', '表單'), Reports: localized(ctx, 'Reports', '報告') })[section] ?? section, document.title ?? localized(ctx, 'Untitled', '未命名')]);
}

export function renderMath(ctx) {
  const document = ctx.document ?? { title: 'Untitled formula', content: {} };
  const formula = document.content?.formula ?? 'sqrt(x^2 + y^2) = r';
  const mathml = ctx.renderMathMl(formula);
  const body = `<div class="editor-body" style="grid-template-columns:1fr"><div class="math-layout">
    <aside class="symbol-palette"><h2>${escapeHtml(ctx.t('math.symbols'))}</h2><div class="symbol-grid">${MATH_SYMBOLS.map((symbol) => `<button class="symbol-button" data-action="math-symbol" data-symbol="${escapeAttribute(symbol)}" aria-label="${escapeAttribute(localized(ctx, 'Insert {symbol}', '插入 {symbol}', { symbol }))}">${escapeHtml(symbol)}</button>`).join('')}</div></aside>
    <div class="math-stage"><div class="math-preview" aria-live="polite">${mathml}</div><label class="field"><span>${escapeHtml(ctx.t('math.command'))}</span><textarea class="math-editor" data-math-editor="true" spellcheck="false">${escapeHtml(formula)}</textarea></label></div>
  </div></div>`;
  return editorFrame(ctx, 'math', body, [ctx.t('status.formula'), document.title ?? 'Untitled']);
}
