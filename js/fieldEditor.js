import { S, createField, updateField, deleteField, tableById } from './store.js';
import { h, modal, toast, confirmBox } from './ui.js';
import { T } from './i18n.js';

export const TYPES = () => [
  ['short_text', T('短文本', 'Short text')],
  ['long_text', T('长文本', 'Long text')],
  ['select', T('单选', 'Single select')],
  ['multi_select', T('多选', 'Multi select')],
  ['number', T('数字', 'Number')],
  ['entry_link', T('词条链接', 'Entry links')],
  ['char_breakdown', T('逐字拆解', 'Character breakdown')],
];
export const PLACEMENTS = () => [
  ['title', T('标题（词条名）', 'Title (headword)')],
  ['subtitle', T('副标题', 'Subtitle')],
  ['shared', T('公共段落（词源、发音等）', 'Shared section (etymology, pronunciation…)')],
  ['pos', T('词性标题', 'Part-of-speech heading')],
  ['sense', T('词性下的内容（释义等）', 'Under part of speech (definitions…)')],
  ['infobox', T('右侧信息框', 'Infobox')],
  ['hidden', T('不在词条页显示', 'Hidden on entry page')],
];
export const typeLabel = (t) => (TYPES().find((x) => x[0] === t) || [t, t])[1];
export const placementLabel = (p) => (PLACEMENTS().find((x) => x[0] === p) || [p, p])[1];

/** 词典的词汇表才需要设置“在词条页中的位置” */
export const needsPlacement = (tableId) => S.project?.kind === 'dictionary' && tableById(tableId)?.role === 'words';

/** 新增或编辑一列。field 为空时是新增。 */
export function openFieldEditor({ tableId, field = null } = {}) {
  tableId = field?.table_id || tableId;
  const o = field?.options || {};
  const label = h('input', { type: 'text', value: field?.label || '', placeholder: T('例如：复数、词源、IPA', 'e.g. Plural, Etymology, IPA') });
  const type = h('select', {}, TYPES().map(([v, l]) => h('option', { value: v, selected: (field?.type || 'short_text') === v }, l)));
  const placement = h('select', {}, PLACEMENTS().map(([v, l]) => h('option', { value: v, selected: (o.placement || 'sense') === v }, l)));
  const group = h('input', { type: 'text', value: o.group || '', placeholder: T('例如：发音', 'e.g. Pronunciation') });
  const choices = h('textarea', { rows: 4, placeholder: T('每行一个选项', 'One option per line') });
  choices.value = (o.choices || []).join('\n');
  const useRT = h('input', { type: 'checkbox', checked: o.choicesFrom === 'readingTypes' });
  const font = h('select', {}, h('option', { value: '' }, T('默认字体', 'Default font')), (S.project.settings.fonts || []).map((f) => h('option', { value: f.family, selected: o.font === f.family }, f.family)));

  const rowPlacement = h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('在词条页中的位置', 'Position on the entry page')), placement);
  const rowGroup = h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('分组标题（可选）', 'Group heading (optional)')), group,
    h('span', { class: 'hint' }, T('同一分组的公共字段会合并在一个标题下，例如 IPA 和罗马字都放进「发音」。', 'Shared fields with the same group appear under one heading, e.g. IPA and romanization under “Pronunciation”.')));
  const rowChoices = h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('选项', 'Options')), choices,
    h('label', { class: 'check' }, useRT, T('改用设置里的「读法类型」列表', 'Use the “reading types” list from settings instead')));
  const rowTypeNote = h('p', { class: 'hint' }, T('逐字拆解用来记录本词每个字的读音和读法类型。读法类型在「设置」中统一管理。', 'A character breakdown records the reading and reading type of each character. Reading types are managed in Settings.'));

  function sync() {
    const t = type.value;
    rowPlacement.hidden = !needsPlacement(tableId);
    rowGroup.hidden = !needsPlacement(tableId) || placement.value !== 'shared';
    rowChoices.hidden = !(t === 'select' || t === 'multi_select');
    choices.disabled = useRT.checked;
    rowTypeNote.hidden = t !== 'char_breakdown';
  }
  type.addEventListener('change', sync); placement.addEventListener('change', sync); useRT.addEventListener('change', sync);
  sync();

  const body = h('div', { class: 'form' },
    h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('列名', 'Column name')), label),
    h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('类型', 'Type')), type),
    rowTypeNote, rowPlacement, rowGroup, rowChoices,
    (S.project.settings.fonts || []).length ? h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('字体', 'Font')), font) : null,
  );

  const actions = [];
  if (field) actions.push({ label: T('删除此列', 'Delete column'), kind: 'danger', left: true, onClick: async (close) => {
    if (!(await confirmBox(T(`删除「${field.label}」这一列？所有词条里这一列的内容都会一起删除。`, `Delete the column “${field.label}”? Its content in every entry will be deleted too.`), { danger: true, okLabel: T('删除', 'Delete') }))) return;
    close(); await deleteField(field.id); toast(T('已删除', 'Deleted'));
  } });
  actions.push({ label: T('取消', 'Cancel'), onClick: (close) => close() });
  actions.push({ label: field ? T('保存', 'Save') : T('添加', 'Add'), kind: 'primary', onClick: async (close) => {
    const name = label.value.trim();
    if (!name) { toast(T('请填写列名', 'Enter a column name')); label.focus(); return; }
    const options = { ...o };
    const t = type.value;
    if (needsPlacement(tableId)) options.placement = placement.value; else delete options.placement;
    if (needsPlacement(tableId) && placement.value === 'shared' && group.value.trim()) options.group = group.value.trim(); else delete options.group;
    if (t === 'select' || t === 'multi_select') {
      options.choices = choices.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (useRT.checked) options.choicesFrom = 'readingTypes'; else delete options.choicesFrom;
    } else { delete options.choices; delete options.choicesFrom; }
    if (font.value) options.font = font.value; else delete options.font;
    if (field) await updateField(field.id, { label: name, type: t, options });
    else await createField(tableId, { label: name, type: t, options });
    close();
  } });
  modal({ title: field ? T('编辑列', 'Edit column') : T('添加列', 'Add column'), body, actions });
}
