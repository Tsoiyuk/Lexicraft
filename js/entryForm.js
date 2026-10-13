import { S, fieldsOf, createEntry, updateEntry, deleteEntry, setEntryTags, charReadings, choicesOf, tableById } from './store.js';
import { h, modal, toast, confirmBox } from './ui.js';
import { T } from './i18n.js';
import { fontStyle, isEmpty } from './render.js';
import { tagChip } from './tags.js';

/** 新增 / 编辑一个词条（闪卡和词典共用） */
export function openEntryForm({ tableId, entry = null, prefill = {}, onSaved } = {}) {
  tableId = entry?.table_id || tableId;
  const fields = fieldsOf(tableId);
  if (!fields.length) { toast(T('这张表还没有列，请先添加列', 'This table has no columns yet. Add a column first.')); return; }
  const data = structuredClone(entry?.data ?? prefill ?? {});
  const getters = [];
  const body = h('div', { class: 'form' });
  for (const f of fields) {
    const { el, get } = inputFor(f, data[f.key]);
    getters.push([f, get]);
    body.append(h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), el));
  }
  const selected = new Set(entry ? S.entryTags.get(entry.id) || [] : prefill.__tags || []);
  if (S.tags.length) {
    const chips = h('div', { class: 'chips' });
    const draw = () => chips.replaceChildren(...S.tags.map((t) => tagChip(t, { active: selected.has(t.id), onClick: () => { selected.has(t.id) ? selected.delete(t.id) : selected.add(t.id); draw(); } })));
    draw();
    body.append(h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('标签', 'Tags')), chips));
  }

  const extras = {};
  if (entry) for (const [k, v] of Object.entries(entry.data || {})) if (!fields.some((f) => f.key === k)) extras[k] = v;

  function collect() {
    const out = { ...extras };
    for (const [f, get] of getters) { const v = get(); if (!isEmpty(v)) out[f.key] = v; }
    return out;
  }
  async function save() {
    const out = collect();
    if (!Object.keys(out).length) { toast(T('请至少填写一项', 'Fill in at least one field')); return false; }
    if (entry) { await updateEntry(entry.id, out); await setEntryTags(entry.id, [...selected]); onSaved?.(S.entries.get(entry.id)); }
    else { const row = await createEntry(tableId, out, [...selected]); onSaved?.(row); }
    return true;
  }

  const actions = [];
  if (entry) actions.push({ label: T('删除', 'Delete'), kind: 'danger', left: true, onClick: async (close) => {
    if (!(await confirmBox(T('删除这个词条？', 'Delete this entry?'), { danger: true, okLabel: T('删除', 'Delete') }))) return;
    close(); await deleteEntry(entry.id); toast(T('已删除', 'Deleted'));
  } });
  actions.push({ label: T('取消', 'Cancel'), onClick: (close) => close() });
  if (!entry) actions.push({ label: T('保存并继续', 'Save & add another'), onClick: async (close) => {
    if (await save()) { close(); toast(T('已保存', 'Saved')); openEntryForm({ tableId, prefill: { __tags: [...selected] }, onSaved }); }
  } });
  actions.push({ label: T('保存', 'Save'), kind: 'primary', onClick: async (close) => { if (await save()) { close(); toast(T('已保存', 'Saved')); } } });

  const tname = tableById(tableId)?.name || '';
  const m = modal({ title: (entry ? T('编辑', 'Edit') : T('新增', 'New')) + (tname ? T(`（${tname}）`, ` (${tname})`) : ''), body, actions, wide: fields.some((f) => f.type === 'char_breakdown') });
  m.box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); m.box.querySelector('.modal-foot .btn.primary')?.click(); }
  });
}

function inputFor(f, v) {
  const style = fontStyle(f);
  switch (f.type) {
    case 'long_text': {
      const el = h('textarea', { rows: 3, style });
      el.value = v ?? '';
      if (S.project.kind === 'dictionary') el.placeholder = T('每行一条；以「:」开头的行是例句；[[词条]] 可链接到其他词条', 'One per line; lines starting with “:” are examples; [[word]] links to another entry');
      return { el, get: () => el.value.replace(/\s+$/, '') || null };
    }
    case 'number': {
      const el = h('input', { type: 'number', step: 'any', value: v ?? '' });
      return { el, get: () => (el.value === '' ? null : Number(el.value)) };
    }
    case 'select': {
      const cs = choicesOf(f);
      const all = v && !cs.includes(v) ? [...cs, v] : cs;
      const el = h('select', { style }, h('option', { value: '' }, '—'), all.map((c) => h('option', { value: c, selected: c === v }, c)));
      return { el, get: () => el.value || null };
    }
    case 'multi_select': {
      const cs = choicesOf(f);
      const sel = new Set(Array.isArray(v) ? v : v ? [v] : []);
      const all = [...new Set([...cs, ...sel])];
      const el = h('div', { class: 'chips' });
      const draw = () => el.replaceChildren(...(all.length ? all.map((c) => h('button', { type: 'button', class: 'opt' + (sel.has(c) ? ' on' : ''), 'aria-pressed': String(sel.has(c)), style, onClick: () => { sel.has(c) ? sel.delete(c) : sel.add(c); draw(); } }, c)) : [h('span', { class: 'hint' }, T('这一列还没有选项，可在列设置中添加。', 'No options yet. Add them in the column settings.'))]));
      draw();
      return { el, get: () => all.filter((c) => sel.has(c)) };
    }
    case 'char_breakdown': return charEditor(f, v);
    default: {
      const el = h('input', { type: 'text', value: v ?? '', style });
      if (f.type === 'entry_link') el.placeholder = T('多个词条用逗号分隔', 'Separate entries with commas');
      return { el, get: () => el.value.trim() || null };
    }
  }
}

/** 逐字拆解编辑器：输入字串 → 为每个字填写读音与读法类型；可套用读法模板 */
function charEditor(f, v) {
  let items = Array.isArray(v) ? v.map((x) => ({ c: x.c, r: x.r || '', t: x.t || '' })) : [];
  const types = S.project.settings.readingTypes || [];
  const style = fontStyle(f);
  const seq = h('input', { type: 'text', class: 'cb-seq', value: items.map((x) => x.c).join(''), style, placeholder: T('输入本词中的字，例如：茶色', 'Type the characters, e.g. 茶色') });
  seq.addEventListener('input', () => {
    const cs = [...seq.value].filter((c) => c.trim());
    items = cs.map((c, i) => (items[i]?.c === c ? items[i] : { c, r: '', t: '' }));
    drawRows();
  });
  const tplSel = h('select', {}, h('option', { value: '' }, T('套用读法模板…', 'Apply a reading template…')), S.templates.map((t) => h('option', { value: t.id }, t.name)));
  tplSel.addEventListener('change', () => {
    const t = S.templates.find((x) => x.id === tplSel.value);
    tplSel.value = '';
    const pat = t?.rule?.pattern || [];
    if (!pat.length) return;
    items = items.map((it, i) => {
      const type = pat[Math.min(i, pat.length - 1)];
      const rs = charReadings(it.c).filter((x) => x.t === type);
      return { ...it, t: type, r: rs.length === 1 ? rs[0].r : it.r };
    });
    drawRows();
  });
  const rowsEl = h('div', { class: 'cb-rows' });
  function drawRows() {
    if (!items.length) { rowsEl.replaceChildren(); return; }
    rowsEl.replaceChildren(...items.map((it) => {
      const opts = charReadings(it.c);
      const dlId = 'dl-' + Math.random().toString(36).slice(2);
      const tsel = h('select', { 'aria-label': T('读法类型', 'Reading type') }, h('option', { value: '' }, '—'), [...new Set([...types, it.t].filter(Boolean))].map((t) => h('option', { value: t, selected: t === it.t }, t)));
      const r = h('input', { type: 'text', value: it.r, list: dlId, placeholder: T('读音', 'Reading'), 'aria-label': T('读音', 'Reading') });
      r.addEventListener('input', () => {
        it.r = r.value;
        const m = opts.find((o) => o.r === it.r);
        if (m && m.t && !it.t) { it.t = m.t; tsel.value = m.t; }
      });
      tsel.addEventListener('change', () => {
        it.t = tsel.value;
        const rs = opts.filter((o) => o.t === it.t);
        if (rs.length === 1 && !it.r) { it.r = rs[0].r; r.value = it.r; }
      });
      const known = opts.length ? h('span', { class: 'cb-known' }, opts.map((o) => `${o.r}${o.t ? ` (${o.t})` : ''}`).join(' / ')) : h('span', { class: 'cb-known muted' }, T('字元表中没有这个字', 'Not in the character table'));
      return h('div', { class: 'cb-row' }, h('span', { class: 'cb-char', style }, it.c), r, h('datalist', { id: dlId }, opts.map((o) => h('option', { value: o.r }, o.t))), tsel, known);
    }));
  }
  drawRows();
  return {
    el: h('div', { class: 'cb-editor' }, h('div', { class: 'row' }, seq, S.templates.length ? tplSel : null), rowsEl),
    get: () => items.filter((x) => x.c).map((x) => ({ c: x.c, r: x.r.trim(), t: x.t })),
  };
}
