import { S, wordsTable, fieldsOf, entriesOf, onChange } from '../store.js';
import { h, norm } from '../ui.js';
import { T } from '../i18n.js';
import { valueToText, fontStyle } from '../render.js';
import { tagChip } from '../tags.js';
import { openEntryForm } from '../entryForm.js';
import { openImport, exportCSV } from '../importExport.js';
import { relLabel } from '../srs.js';

export function renderWords(root) {
  const table = wordsTable();
  let q = '';
  const tf = new Set();
  const search = h('input', { type: 'search', class: 'search', placeholder: T('搜索单词或释义', 'Search words or meanings'), 'aria-label': T('搜索', 'Search') });
  search.addEventListener('input', () => { q = search.value; drawList(); });
  const tagsRow = h('div', { class: 'chips' });
  const count = h('p', { class: 'count muted' });
  const list = h('ul', { class: 'word-list' });
  root.append(
    h('div', { class: 'toolbar' }, search,
      h('button', { class: 'btn primary', onClick: () => openEntryForm({ tableId: table.id }) }, T('新增单词', 'Add word')),
      h('button', { class: 'btn ghost', onClick: () => openImport(table.id, { allowNew: true }) }, T('导入', 'Import')),
      h('button', { class: 'btn ghost', onClick: () => exportCSV(table.id) }, T('导出 CSV', 'Export CSV'))),
    tagsRow, count, list);

  function drawTags() {
    tagsRow.replaceChildren(...S.tags.map((t) => tagChip(t, { small: true, active: tf.has(t.id), onClick: () => { tf.has(t.id) ? tf.delete(t.id) : tf.add(t.id); drawTags(); drawList(); } })));
  }
  function drawList() {
    const fields = fieldsOf(table.id);
    const faces = (S.project.settings.faces || []).map((f) => f.map((k) => fields.find((x) => x.key === k)).filter(Boolean)).filter((f) => f.length);
    const head = faces[0]?.[0] || fields[0];
    const subFields = faces[1] || fields.slice(1, 2);
    const nq = norm(q);
    const all = entriesOf(table.id).reverse();
    const items = all.filter((e) => {
      if (tf.size) { const s = S.entryTags.get(e.id); if (!s || ![...tf].some((t) => s.has(t))) return false; }
      if (!nq) return true;
      return fields.some((f) => norm(valueToText(f, e.data?.[f.key])).includes(nq));
    });
    count.textContent = T(`共 ${all.length} 个单词`, `${all.length} words`) + (items.length !== all.length ? T(`，显示 ${items.length} 个`, `, showing ${items.length}`) : '');
    const now = Date.now();
    list.replaceChildren(...(items.length ? items.slice(0, 1500).map((e) => {
      const r = S.reviews.get(e.id);
      const when = !r?.first_seen ? T('未学', 'New') : Date.parse(r.due) <= now ? T('已到期', 'Due') : relLabel(Date.parse(r.due) - now);
      const head2 = (faces[0] || [head]).map((f) => valueToText(f, e.data?.[f.key])).filter(Boolean).join(' ');
      return h('li', {}, h('button', { type: 'button', class: 'word-row', onClick: () => openEntryForm({ entry: e }) },
        h('span', { class: 'w', style: fontStyle(head) }, head2 || '—'),
        h('span', { class: 'm' }, subFields.map((f) => valueToText(f, e.data?.[f.key])).filter(Boolean).join(T('；', '; ')).replace(/\s+/g, ' ')),
        h('span', { class: 'row-tags' }, S.tags.filter((t) => S.entryTags.get(e.id)?.has(t.id)).map((t) => tagChip(t, { small: true }))),
        h('span', { class: 'when' }, when)));
    }) : [h('li', { class: 'empty-row' }, all.length ? T('没有符合的单词。', 'No matching words.') : T('词库是空的。点「新增单词」或「导入」开始。', 'No words yet. Use “Add word” or “Import” to start.'))]));
  }
  drawTags(); drawList();
  let raf = 0;
  const off = onChange((ev) => { if (ev.kind === 'tags') drawTags(); cancelAnimationFrame(raf); raf = requestAnimationFrame(drawList); });
  return () => { off(); cancelAnimationFrame(raf); };
}
