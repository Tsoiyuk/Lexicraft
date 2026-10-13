import { S, fieldsOf, tableById, bulkInsertEntries, createField, createTag, bulkAddEntryTags, bulkSaveReviews } from './store.js';
import { h, modal, toast, downloadText } from './ui.js';
import { T } from './i18n.js';
import { textToValue, valueToText, isEmpty } from './render.js';
import { nextColor } from './tags.js';

/** 解析 CSV / TSV（Excel 复制出来的是 TSV）/ 以 | 分隔的文本 */
export function parseDelimited(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const first = text.split('\n', 1)[0];
  const delim = first.includes('\t') ? '\t' : first.includes('|') ? '|' : ',';
  if (delim === '|') return text.split('\n').filter((l) => l.trim()).map((l) => l.split('|').map((s) => s.trim()));
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== '')).map((r) => r.map((c) => c.trim()));
}

const TAG_HEADER = /^(标签|標籤|tags?)$/i;

export function openImport(tableId, { allowNew = false } = {}) {
  const ta = h('textarea', { rows: 9, class: 'mono', placeholder: T('从 Excel 复制粘贴，或选择 CSV 文件。第一行是列名。\n也可以每行一个：单词 | 释义 | 例句', 'Paste from Excel or choose a CSV file. The first row holds the column names.\nOr one per line: word | meaning | example') });
  const file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.json,text/csv,text/plain,application/json' });
  const header = h('input', { type: 'checkbox', checked: true });
  const newCols = h('input', { type: 'checkbox', checked: true });
  const info = h('p', { class: 'hint' });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; ta.value = await f.text(); preview(); });
  ta.addEventListener('input', preview);
  header.addEventListener('change', preview);
  function preview() {
    const s = ta.value.trim();
    if (!s) { info.textContent = ''; return; }
    if (/^[[{]/.test(s)) { try { const arr = JSON.parse(s); info.textContent = T(`旧版单词卡数据：${arr.length} 个单词（含复习进度）`, `Old flashcard data: ${arr.length} words (with review progress)`); } catch (e) { info.textContent = T('JSON 格式不正确', 'Invalid JSON'); } return; }
    const rows = parseDelimited(s);
    const n = header.checked ? rows.length - 1 : rows.length;
    const fields = fieldsOf(tableId);
    let unmatched = [];
    if (header.checked && rows[0]) unmatched = rows[0].filter((c) => c && !TAG_HEADER.test(c) && !matchField(fields, c));
    info.textContent = T(`识别到 ${Math.max(0, n)} 行，${rows[0]?.length || 0} 列。`, `Found ${Math.max(0, n)} rows and ${rows[0]?.length || 0} columns.`) +
      (unmatched.length ? T(` 未对应的列：${unmatched.join('、')}`, ` Unmatched columns: ${unmatched.join(', ')}`) : '');
  }
  const fields = fieldsOf(tableId);
  const body = h('div', { class: 'form' },
    h('p', { class: 'hint' }, T('现有的列：', 'Existing columns: ') + fields.map((f) => f.label).join(T('、', ', ')) + T('。名为「标签」的列会变成标签。', '. A column named “Tags” becomes tags.')),
    ta, h('div', { class: 'row' }, file),
    h('label', { class: 'check' }, header, T('第一行是列名', 'First row is the header')),
    allowNew ? h('label', { class: 'check' }, newCols, T('为对应不上的列名新建列', 'Create new columns for unmatched headers')) : null,
    info);
  modal({
    title: T(`导入（${tableById(tableId)?.name || ''}）`, `Import (${tableById(tableId)?.name || ''})`), body, wide: true,
    actions: [
      { label: T('取消', 'Cancel'), onClick: (c) => c() },
      { label: T('导入', 'Import'), kind: 'primary', onClick: async (close) => {
        const s = ta.value.trim();
        if (!s) { toast(T('没有内容可以导入', 'Nothing to import')); return; }
        const n = /^[[{]/.test(s) ? await importOldJSON(tableId, JSON.parse(s)) : await importRows(tableId, parseDelimited(s), { header: header.checked, allowNew: allowNew && newCols.checked });
        toast(T(`已导入 ${n} 个词条`, `Imported ${n} entries`));
        close();
      } },
    ],
  });
}

const matchField = (fields, name) => { const n = name.trim().toLowerCase(); return fields.find((f) => f.label.trim().toLowerCase() === n || f.key === n); };

async function importRows(tableId, rows, { header, allowNew }) {
  if (!rows.length) return 0;
  let fields = fieldsOf(tableId);
  const map = []; let tagCol = -1;
  if (header) {
    const hdr = rows.shift();
    for (const [i, name] of hdr.entries()) {
      if (TAG_HEADER.test(name)) { tagCol = i; continue; }
      let f = name ? matchField(fields, name) : null;
      if (!f && allowNew && name) { f = await createField(tableId, { label: name, type: 'short_text', options: {} }); fields = fieldsOf(tableId); }
      map[i] = f || null;
    }
  } else rows[0].forEach((_, i) => { map[i] = fields[i] || null; });

  const datas = [], tagNames = [];
  for (const r of rows) {
    const d = {};
    r.forEach((cell, i) => { const f = map[i]; if (!f) return; const v = textToValue(f, cell); if (!isEmpty(v)) d[f.key] = v; });
    if (!Object.keys(d).length) continue;
    datas.push(d);
    tagNames.push(tagCol >= 0 ? String(r[tagCol] || '').split(/\s*[,，;；]\s*/).filter(Boolean) : []);
  }
  const inserted = await bulkInsertEntries(tableId, datas);
  const allNames = [...new Set(tagNames.flat())];
  if (allNames.length) {
    const byName = new Map(S.tags.map((t) => [t.name, t]));
    for (const name of allNames) if (!byName.has(name)) byName.set(name, await createTag(name, nextColor(S.tags.length)));
    const pairs = [];
    inserted.forEach((row, i) => { for (const n of tagNames[i] || []) pairs.push({ entry_id: row.id, tag_id: byName.get(n).id }); });
    if (pairs.length) await bulkAddEntryTags(pairs);
  }
  return inserted.length;
}

/** 从第一版「单词卡」导入，保留复习进度 */
async function importOldJSON(tableId, arr) {
  if (!Array.isArray(arr)) arr = [arr];
  const fields = fieldsOf(tableId);
  const pick = (names, idx) => fields.find((f) => names.includes(f.key)) || fields[idx];
  const fFront = pick(['word', 'front', 'headword'], 0), fBack = pick(['meaning', 'back', 'definition'], 1);
  const fEx = pick(['example'], 2), fNote = pick(['note'], 3);
  const used = new Set();
  const put = (d, f, v) => { if (!f || isEmpty(v)) return; if (used.has(f.key) && d[f.key]) d[f.key] += '\n' + v; else d[f.key] = v; };
  const datas = arr.map((c) => { const d = {}; used.clear(); for (const [f, v] of [[fFront, c.front], [fBack, c.back], [fEx, c.example], [fNote, c.note]]) { put(d, f, v); if (f) used.add(f.key); } return d; });
  const keep = datas.map((d, i) => [d, arr[i]]).filter(([d]) => Object.keys(d).length);
  const inserted = await bulkInsertEntries(tableId, keep.map((x) => x[0]));
  const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
  const reviews = [];
  inserted.forEach((row, i) => {
    const c = keep[i][1];
    if (!c.firstSeen) return;
    reviews.push({ entry_id: row.id, due: iso(c.due) || new Date().toISOString(), interval_days: c.interval || 0, ease: c.ease || 2.5, reps: c.reps || 0, lapses: c.lapses || 0, first_seen: iso(c.firstSeen), last_review: iso(c.lastReview || c.firstSeen) });
  });
  if (reviews.length) await bulkSaveReviews(reviews);
  return inserted.length;
}

export function exportCSV(tableId) {
  const fields = fieldsOf(tableId);
  const q = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [[...fields.map((f) => f.label), T('标签', 'Tags')].map(q).join(',')];
  const rows = [...S.entries.values()].filter((e) => e.table_id === tableId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of rows) {
    const tagNames = S.tags.filter((t) => S.entryTags.get(e.id)?.has(t.id)).map((t) => t.name).join(', ');
    lines.push([...fields.map((f) => valueToText(f, e.data?.[f.key])), tagNames].map(q).join(','));
  }
  const name = `${S.project.name}-${tableById(tableId)?.name || 'table'}.csv`.replace(/[\\/:*?"<>|]+/g, '_');
  downloadText(name, '\uFEFF' + lines.join('\r\n'));
}
