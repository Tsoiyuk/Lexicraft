import { S, sortedTables, tableById, fieldsOf, entriesOf, onChange, setEntryField, createEntry, deleteEntry, createTable, moveField, choicesOf } from '../store.js';
import { h, esc, norm, toast, confirmBox, errMsg, modal } from '../ui.js';
import { T } from '../i18n.js';
import { valueToText, fontStyle, isEmpty } from '../render.js';
import { openEntryForm } from '../entryForm.js';
import { openFieldEditor, typeLabel } from '../fieldEditor.js';
import { openImport, exportCSV } from '../importExport.js';

const TABULATOR = 'https://cdn.jsdelivr.net/npm/tabulator-tables@6.2.1/+esm';
let tabulatorP = null;
const loadTabulator = () => (tabulatorP ||= import(TABULATOR).then((m) => m.TabulatorFull || m.Tabulator || m.default));

export function renderTable(root, rest) {
  const pid = S.pid;
  let tid = rest[0] && tableById(rest[0]) ? rest[0] : sortedTables()[0]?.id;
  let grid = null, alive = true, q = '';

  const tabsEl = h('div', { class: 'subtabs', role: 'tablist' });
  const search = h('input', { type: 'search', class: 'search', placeholder: T('在表格中搜索', 'Search this table'), 'aria-label': T('搜索', 'Search') });
  search.addEventListener('input', () => { q = search.value; applyFilter(); });
  const holder = h('div', { class: 'grid-holder' }, h('p', { class: 'muted pad' }, T('正在载入表格…', 'Loading the table…')));
  const toolbar = h('div', { class: 'toolbar' }, search,
    h('button', { class: 'btn primary', onClick: addRow }, T('添加行', 'Add row')),
    h('button', { class: 'btn ghost', onClick: () => openFieldEditor({ tableId: tid }) }, T('添加列', 'Add column')),
    h('button', { class: 'btn ghost', onClick: () => openImport(tid, { allowNew: true }) }, T('导入', 'Import')),
    h('button', { class: 'btn ghost', onClick: () => exportCSV(tid) }, T('导出 CSV', 'Export CSV')));
  const hint = h('p', { class: 'hint' }, T('双击格子即可编辑，按 Enter 保存。点列名右侧的 ⋮ 可以改列名、调整顺序或删除列。', 'Double-click a cell to edit; press Enter to save. Use ⋮ on a column header to rename, reorder or delete it.'));
  root.append(tabsEl, toolbar, holder, hint);

  function drawTabs() {
    tabsEl.replaceChildren(...sortedTables().map((t) => h('a', { href: `#/p/${pid}/table/${t.id}`, role: 'tab', 'aria-selected': String(t.id === tid), class: 'subtab' }, t.name,
      h('span', { class: 'subtab-count' }, String(entriesOf(t.id).length)))),
      h('button', { class: 'subtab add', type: 'button', onClick: newTable }, T('＋ 新表格', '+ New table')));
  }

  function newTable() {
    const name = h('input', { type: 'text', placeholder: T('例如：字元、词根、例句', 'e.g. Characters, Roots, Examples') });
    modal({ title: T('新建表格', 'New table'), body: h('div', { class: 'form' }, h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('表格名称', 'Table name')), name)),
      actions: [{ label: T('取消', 'Cancel'), onClick: (c) => c() }, { label: T('创建', 'Create'), kind: 'primary', onClick: async (close) => {
        if (!name.value.trim()) return;
        const t = await createTable(name.value.trim(), 'other'); close(); location.hash = `#/p/${pid}/table/${t.id}`;
      } }] });
  }

  const rowOf = (e) => { const r = { id: e.id }; for (const f of fieldsOf(tid)) r[f.key] = e.data?.[f.key] ?? null; return r; };

  function columns() {
    const cols = [{
      title: '', field: '_act', headerSort: false, frozen: true, width: 70, resizable: false, hozAlign: 'center',
      formatter: () => `<button class="cell-btn" data-a="edit" title="${esc(T('在表单中编辑', 'Edit in form'))}">✎</button><button class="cell-btn danger" data-a="del" title="${esc(T('删除这一行', 'Delete row'))}">✕</button>`,
      cellClick: async (e, cell) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        const id = cell.getRow().getData().id;
        if (a === 'edit') openEntryForm({ entry: S.entries.get(id) });
        if (a === 'del' && (await confirmBox(T('删除这一行？', 'Delete this row?'), { danger: true, okLabel: T('删除', 'Delete') }))) deleteEntry(id).catch((err) => toast(errMsg(err)));
      },
    }];
    for (const f of fieldsOf(tid)) {
      const col = {
        title: f.label, field: f.key, minWidth: 110, maxInitialWidth: 360, headerTooltip: typeLabel(f.type),
        formatter: (cell) => { const v = cell.getValue(); return isEmpty(v) ? '' : `<span class="cv${f.type === 'long_text' ? ' long' : ''}" style='${fontStyle(f)}'>${esc(valueToText(f, v))}</span>`; },
        sorter: (a, b) => valueToText(f, a).localeCompare(valueToText(f, b), undefined, { numeric: true }),
        headerMenu: [
          { label: T('编辑列', 'Edit column'), action: () => openFieldEditor({ field: f }) },
          { label: T('左移', 'Move left'), action: () => moveField(f.id, -1) },
          { label: T('右移', 'Move right'), action: () => moveField(f.id, 1) },
        ],
        headerMenuIcon: '⋮',
      };
      switch (f.type) {
        case 'long_text': col.editor = 'textarea'; col.variableHeight = true; break;
        case 'number': col.editor = 'number'; col.sorter = 'number'; break;
        case 'select': col.editor = 'list'; col.editorParams = { values: ['', ...choicesOf(f)], autocomplete: true, listOnEmpty: true, clearable: true }; break;
        case 'multi_select': col.editor = 'list'; col.editorParams = { values: choicesOf(f), multiselect: true, clearable: true }; break;
        case 'char_breakdown': col.editor = false; col.cellClick = (e, cell) => openEntryForm({ entry: S.entries.get(cell.getRow().getData().id) }); col.cssClass = 'clickable'; break;
        default: col.editor = 'input';
      }
      cols.push(col);
    }
    return cols;
  }

  function applyFilter() {
    if (!grid) return;
    const nq = norm(q);
    if (!nq) { grid.clearFilter(); return; }
    const fs = fieldsOf(tid);
    grid.setFilter((d) => fs.some((f) => norm(valueToText(f, d[f.key])).includes(nq)));
  }

  async function addRow() {
    const fs = fieldsOf(tid);
    if (!fs.length) { openFieldEditor({ tableId: tid }); return; }
    try {
      const row = await createEntry(tid, {});
      if (!grid) return;
      setTimeout(() => {
        const r = grid.getRow(row.id);
        if (!r) return;
        grid.scrollToRow(r, 'center', false).catch(() => {});
        const cell = r.getCells().find((c) => c.getColumn().getField() !== '_act' && c.getColumn().getDefinition().editor);
        cell && cell.edit();
      }, 50);
    } catch (err) { toast(errMsg(err)); }
  }

  async function build() {
    drawTabs();
    if (!tid) { holder.replaceChildren(h('p', { class: 'muted pad' }, T('这个项目还没有表格。', 'This project has no tables yet.'))); return; }
    let Tabulator;
    try { Tabulator = await loadTabulator(); } catch (e) { holder.replaceChildren(h('p', { class: 'error pad' }, T('表格组件载入失败，请检查网络后重新整理页面。', 'The table component failed to load. Check your connection and reload.'))); return; }
    if (!alive) return;
    holder.replaceChildren();
    const el = h('div', { class: 'grid' });
    holder.append(el);
    grid = new Tabulator(el, {
      data: entriesOf(tid).map(rowOf), index: 'id', columns: columns(),
      layout: 'fitDataStretch', height: 'calc(100vh - 260px)', renderVertical: 'virtual',
      placeholder: T('还没有数据。点击「添加行」或「导入」开始。', 'No rows yet. Use “Add row” or “Import” to start.'),
      columnDefaults: { resizable: true, headerSort: true }, editTriggerEvent: 'dblclick',
    });
    grid.on('cellEdited', (cell) => {
      const key = cell.getField();
      const f = fieldsOf(tid).find((x) => x.key === key); if (!f) return;
      let v = cell.getValue();
      if (f.type === 'number' && v !== '' && v != null) v = Number(v);
      if (typeof v === 'string') v = v.trim();
      if (isEmpty(v)) v = null;
      setEntryField(cell.getRow().getData().id, key, v).catch((err) => { toast(errMsg(err)); });
    });
    grid.on('tableBuilt', applyFilter);
  }

  const off = onChange((ev) => {
    if (!grid) { if (ev.kind === 'tables') drawTabs(); return; }
    switch (ev.kind) {
      case 'entry':
        if (ev.op === 'delete') { if (grid.getRow(ev.id)) grid.deleteRow(ev.id); }
        else if (ev.row.table_id === tid && !ev.local) grid.updateOrAddData([rowOf(ev.row)]);
        drawTabs(); break;
      case 'bulk': grid.replaceData(entriesOf(tid).map(rowOf)); drawTabs(); break;
      case 'fields': grid.setColumns(columns()); grid.replaceData(entriesOf(tid).map(rowOf)); break;
      case 'tables': if (!tableById(tid)) { location.hash = `#/p/${pid}/table`; } else drawTabs(); break;
      case 'project': grid.setColumns(columns()); break;
    }
  });

  build();
  return () => { alive = false; off(); try { grid?.destroy(); } catch (e) {} };
}
