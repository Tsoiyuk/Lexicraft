import { sb } from './supabase.js';
import { getPresets } from './presets.js';

/** 当前打开的项目的全部数据 */
export const S = {
  user: null, pid: null, project: null,
  tables: [], fields: [], entries: new Map(), tags: [],
  entryTags: new Map(), reviews: new Map(), templates: [],
};

let channel = null;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function emit(ev) { for (const fn of [...listeners]) { try { fn(ev); } catch (e) { console.error(e); } } }

const chk = ({ data, error }) => { if (error) throw error; return data; };

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const data = chk(await build().range(from, from + 999));
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ---------- 读取 ----------

export function resetProject() {
  if (channel) { sb.removeChannel(channel); channel = null; }
  Object.assign(S, { pid: null, project: null, tables: [], fields: [], entries: new Map(), tags: [], entryTags: new Map(), reviews: new Map(), templates: [] });
}

export async function loadProject(pid) {
  resetProject();
  const p = chk(await sb.from('lc_projects').select('*').eq('id', pid).maybeSingle());
  if (!p) return false;
  const [tables, fields, entries, tags, ets, reviews, templates] = await Promise.all([
    sb.from('lc_tables').select('*').eq('project_id', pid).order('position').then(chk),
    sb.from('lc_fields').select('*').eq('project_id', pid).order('position').then(chk),
    fetchAll(() => sb.from('lc_entries').select('*').eq('project_id', pid).order('created_at').order('id')),
    sb.from('lc_tags').select('*').eq('project_id', pid).order('name').then(chk),
    fetchAll(() => sb.from('lc_entry_tags').select('entry_id,tag_id').eq('project_id', pid).order('entry_id').order('tag_id')),
    fetchAll(() => sb.from('lc_reviews').select('*').eq('project_id', pid).eq('user_id', S.user.id).order('entry_id')),
    sb.from('lc_reading_templates').select('*').eq('project_id', pid).order('created_at').then(chk),
  ]);
  p.settings = p.settings || {};
  S.pid = pid; S.project = p; S.tables = tables; S.fields = fields; S.tags = tags; S.templates = templates;
  S.entries = new Map(entries.map((e) => [e.id, e]));
  S.entryTags = new Map();
  for (const { entry_id, tag_id } of ets) { if (!S.entryTags.has(entry_id)) S.entryTags.set(entry_id, new Set()); S.entryTags.get(entry_id).add(tag_id); }
  S.reviews = new Map(reviews.map((r) => [r.entry_id, r]));
  subscribe(pid);
  return true;
}

function subscribe(pid) {
  const filter = `project_id=eq.${pid}`;
  channel = sb.channel('lc-' + pid);
  for (const table of ['lc_entries', 'lc_fields', 'lc_tables', 'lc_tags']) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (p) => onRealtime(table, 'up', p.new));
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, (p) => onRealtime(table, 'up', p.new));
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => onRealtime(table, 'del', p.old));
  }
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lc_entry_tags', filter }, (p) => onRealtime('lc_entry_tags', 'up', p.new));
  channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lc_entry_tags' }, (p) => onRealtime('lc_entry_tags', 'del', p.old));
  channel.subscribe();
}

function upsertArr(arr, row, op) {
  const i = arr.findIndex((x) => x.id === row.id);
  if (op === 'del') { if (i < 0) return false; arr.splice(i, 1); return true; }
  if (i >= 0) arr[i] = row; else arr.push(row);
  return true;
}

function onRealtime(table, op, row) {
  if (!S.pid || !row) return;
  if (op === 'up' && row.project_id && row.project_id !== S.pid) return;
  switch (table) {
    case 'lc_entries':
      if (op === 'up') { S.entries.set(row.id, row); emit({ kind: 'entry', op: 'upsert', row }); }
      else if (S.entries.has(row.id)) { S.entries.delete(row.id); S.entryTags.delete(row.id); S.reviews.delete(row.id); emit({ kind: 'entry', op: 'delete', id: row.id }); }
      break;
    case 'lc_fields': if (upsertArr(S.fields, row, op)) emit({ kind: 'fields' }); break;
    case 'lc_tables': if (upsertArr(S.tables, row, op)) emit({ kind: 'tables' }); break;
    case 'lc_tags':
      if (upsertArr(S.tags, row, op)) {
        if (op === 'del') for (const set of S.entryTags.values()) set.delete(row.id);
        S.tags.sort((a, b) => a.name.localeCompare(b.name));
        emit({ kind: 'tags' });
      }
      break;
    case 'lc_entry_tags': {
      if (!S.entries.has(row.entry_id)) return;
      let set = S.entryTags.get(row.entry_id);
      if (op === 'up') { if (!set) S.entryTags.set(row.entry_id, (set = new Set())); if (set.has(row.tag_id)) return; set.add(row.tag_id); }
      else { if (!set || !set.has(row.tag_id)) return; set.delete(row.tag_id); }
      emit({ kind: 'entryTags', id: row.entry_id });
      break;
    }
  }
}

// ---------- 查询辅助 ----------

export const isOwner = () => !!S.project && S.project.owner_id === S.user?.id;
export const tableById = (id) => S.tables.find((t) => t.id === id);
export const sortedTables = () => [...S.tables].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
export const wordsTable = () => sortedTables().find((t) => t.role === 'words') || sortedTables()[0];
export const fieldsOf = (tid) => S.fields.filter((f) => f.table_id === tid).sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
export function entriesOf(tid) { const out = []; for (const e of S.entries.values()) if (e.table_id === tid) out.push(e); return out.sort((a, b) => a.created_at.localeCompare(b.created_at)); }
export function tagsOf(eid) { const set = S.entryTags.get(eid); return set ? S.tags.filter((t) => set.has(t.id)) : []; }
export const placementOf = (f) => f.options?.placement || 'sense';
export function choicesOf(f) {
  if (f.options?.choicesFrom === 'readingTypes') return S.project?.settings?.readingTypes || [];
  return f.options?.choices || [];
}
/** 在字元表中查找某个字的所有读法 */
export function charReadings(c) {
  const ct = S.project?.settings?.charTable;
  if (!ct || !tableById(ct.tableId)) return [];
  const out = [];
  for (const e of S.entries.values()) {
    if (e.table_id !== ct.tableId || e.data?.[ct.charKey] !== c) continue;
    out.push({ r: String(e.data?.[ct.readingKey] ?? ''), t: String(e.data?.[ct.typeKey] ?? ''), id: e.id });
  }
  return out;
}

// ---------- 项目 ----------

export async function listProjects() {
  return chk(await sb.from('lc_projects').select('id,name,kind,language,owner_id,updated_at,lc_entries(count)').order('updated_at', { ascending: false }));
}

export async function createProject({ name, kind, language, preset }) {
  const def = getPresets()[preset];
  const p = chk(await sb.from('lc_projects').insert({ name, kind, language: language || null, settings: {} }).select().single());
  const settings = structuredClone(def.settings || {});
  for (const [ti, tdef] of def.tables.entries()) {
    const t = chk(await sb.from('lc_tables').insert({ project_id: p.id, name: tdef.name, role: tdef.role, position: ti }).select().single());
    if (tdef.fields.length) chk(await sb.from('lc_fields').insert(tdef.fields.map((f, i) => ({ table_id: t.id, project_id: p.id, key: f.key, label: f.label, type: f.type, options: f.options || {}, position: i }))));
    if (tdef.role === 'characters') settings.charTable = { tableId: t.id, charKey: 'char', readingKey: 'reading', typeKey: 'rtype' };
  }
  chk(await sb.from('lc_projects').update({ settings }).eq('id', p.id));
  return p.id;
}

export async function joinProject(pid, key) { return chk(await sb.rpc('lc_join_project', { p: pid, join_key: key })); }

export async function updateProject(patch) {
  Object.assign(S.project, patch);
  emit({ kind: 'project' });
  chk(await sb.from('lc_projects').update(patch).eq('id', S.pid));
}
export const updateSettings = (patch) => updateProject({ settings: { ...S.project.settings, ...patch } });

export async function deleteProject() { const pid = S.pid; chk(await sb.from('lc_projects').delete().eq('id', pid)); resetProject(); }
export async function leaveProject() { const pid = S.pid; chk(await sb.from('lc_project_members').delete().eq('project_id', pid).eq('user_id', S.user.id)); resetProject(); }
export async function rotateKey() { return chk(await sb.rpc('lc_rotate_join_key', { p: S.pid })); }
export async function listMembers() { return chk(await sb.rpc('lc_list_members', { p: S.pid })); }
export async function removeMember(uid) { chk(await sb.from('lc_project_members').delete().eq('project_id', S.pid).eq('user_id', uid)); }

// ---------- 词条 ----------

const emptyVal = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

export async function createEntry(tableId, data, tagIds = []) {
  const row = chk(await sb.from('lc_entries').insert({ table_id: tableId, project_id: S.pid, data }).select().single());
  S.entries.set(row.id, row);
  emit({ kind: 'entry', op: 'upsert', row });
  if (tagIds.length) await setEntryTags(row.id, tagIds);
  return row;
}

export async function bulkInsertEntries(tableId, datas) {
  const rows = [];
  for (let i = 0; i < datas.length; i += 500) {
    const r = chk(await sb.from('lc_entries').insert(datas.slice(i, i + 500).map((data) => ({ table_id: tableId, project_id: S.pid, data }))).select());
    for (const x of r) S.entries.set(x.id, x);
    rows.push(...r);
  }
  emit({ kind: 'bulk' });
  return rows;
}

/** 只改一格。local:true 的事件让表格视图跳过重绘 */
export async function setEntryField(id, key, value) {
  if (emptyVal(value)) value = null;
  const e = S.entries.get(id);
  if (e) {
    const data = { ...e.data };
    if (value === null) delete data[key]; else data[key] = value;
    const row = { ...e, data, updated_at: new Date().toISOString(), updated_by: S.user.id };
    S.entries.set(id, row);
    emit({ kind: 'entry', op: 'upsert', row, local: true });
  }
  chk(await sb.rpc('lc_set_entry_field', { e: id, field_key: key, value }));
}

export async function updateEntry(id, newData) {
  const old = S.entries.get(id)?.data || {};
  const keys = new Set([...Object.keys(old), ...Object.keys(newData)]);
  const tasks = [];
  for (const k of keys) if (JSON.stringify(old[k] ?? null) !== JSON.stringify(newData[k] ?? null)) tasks.push(setEntryField(id, k, newData[k] ?? null));
  await Promise.all(tasks);
  const row = S.entries.get(id);
  if (row) emit({ kind: 'entry', op: 'upsert', row });
}

export async function deleteEntry(id) {
  S.entries.delete(id); S.entryTags.delete(id); S.reviews.delete(id);
  emit({ kind: 'entry', op: 'delete', id });
  chk(await sb.from('lc_entries').delete().eq('id', id));
}

export async function setEntryTags(entryId, tagIds) {
  const cur = S.entryTags.get(entryId) || new Set();
  const next = new Set(tagIds);
  const add = [...next].filter((t) => !cur.has(t));
  const rem = [...cur].filter((t) => !next.has(t));
  S.entryTags.set(entryId, next);
  emit({ kind: 'entryTags', id: entryId });
  if (add.length) chk(await sb.from('lc_entry_tags').insert(add.map((tag_id) => ({ entry_id: entryId, tag_id, project_id: S.pid }))));
  if (rem.length) chk(await sb.from('lc_entry_tags').delete().eq('entry_id', entryId).in('tag_id', rem));
}

export async function bulkAddEntryTags(pairs) {
  for (const { entry_id, tag_id } of pairs) { if (!S.entryTags.has(entry_id)) S.entryTags.set(entry_id, new Set()); S.entryTags.get(entry_id).add(tag_id); }
  for (let i = 0; i < pairs.length; i += 500) chk(await sb.from('lc_entry_tags').insert(pairs.slice(i, i + 500).map((p) => ({ ...p, project_id: S.pid }))));
  emit({ kind: 'bulk' });
}

// ---------- 标签 ----------

export async function createTag(name, color) {
  const row = chk(await sb.from('lc_tags').insert({ project_id: S.pid, name, color }).select().single());
  upsertArr(S.tags, row, 'up'); S.tags.sort((a, b) => a.name.localeCompare(b.name));
  emit({ kind: 'tags' });
  return row;
}
export async function updateTag(id, patch) {
  const t = S.tags.find((x) => x.id === id); if (t) Object.assign(t, patch);
  emit({ kind: 'tags' });
  chk(await sb.from('lc_tags').update(patch).eq('id', id));
}
export async function deleteTag(id) {
  upsertArr(S.tags, { id }, 'del');
  for (const set of S.entryTags.values()) set.delete(id);
  emit({ kind: 'tags' });
  chk(await sb.from('lc_tags').delete().eq('id', id));
}

// ---------- 表格与字段 ----------

export async function createTable(name, role = 'other') {
  const position = Math.max(-1, ...S.tables.map((t) => t.position)) + 1;
  const row = chk(await sb.from('lc_tables').insert({ project_id: S.pid, name, role, position }).select().single());
  upsertArr(S.tables, row, 'up'); emit({ kind: 'tables' });
  return row;
}
export async function renameTable(id, name) {
  const t = tableById(id); if (t) t.name = name;
  emit({ kind: 'tables' });
  chk(await sb.from('lc_tables').update({ name }).eq('id', id));
}
export async function deleteTable(id) {
  upsertArr(S.tables, { id }, 'del');
  S.fields = S.fields.filter((f) => f.table_id !== id);
  for (const [eid, e] of S.entries) if (e.table_id === id) S.entries.delete(eid);
  emit({ kind: 'tables' }); emit({ kind: 'fields' });
  chk(await sb.from('lc_tables').delete().eq('id', id));
}

export async function createField(tableId, { label, type, options = {} }) {
  const key = 'f' + Math.random().toString(36).slice(2, 8);
  const position = Math.max(-1, ...fieldsOf(tableId).map((f) => f.position)) + 1;
  const row = chk(await sb.from('lc_fields').insert({ table_id: tableId, project_id: S.pid, key, label, type, options, position }).select().single());
  upsertArr(S.fields, row, 'up'); emit({ kind: 'fields' });
  return row;
}
export async function updateField(id, patch) {
  const f = S.fields.find((x) => x.id === id); if (f) Object.assign(f, patch);
  emit({ kind: 'fields' });
  chk(await sb.from('lc_fields').update(patch).eq('id', id));
}
export async function deleteField(id) {
  const f = S.fields.find((x) => x.id === id);
  if (f) {
    upsertArr(S.fields, f, 'del');
    for (const e of S.entries.values()) if (e.table_id === f.table_id && e.data && f.key in e.data) { const d = { ...e.data }; delete d[f.key]; e.data = d; }
    emit({ kind: 'fields' });
  }
  chk(await sb.rpc('lc_delete_field', { f: id }));
}
export async function moveField(id, dir) {
  const f = S.fields.find((x) => x.id === id); if (!f) return;
  const list = fieldsOf(f.table_id);
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const changed = [];
  list.forEach((x, idx) => { if (x.position !== idx) { x.position = idx; changed.push(x); } });
  emit({ kind: 'fields' });
  await Promise.all(changed.map((x) => sb.from('lc_fields').update({ position: x.position }).eq('id', x.id).then(chk)));
}

// ---------- 复习进度 ----------

export async function saveReview(entryId, rev) {
  const row = { user_id: S.user.id, entry_id: entryId, project_id: S.pid, ...rev };
  S.reviews.set(entryId, row);
  emit({ kind: 'review', id: entryId });
  chk(await sb.from('lc_reviews').upsert(row, { onConflict: 'user_id,entry_id' }));
}
export async function bulkSaveReviews(rows) {
  const full = rows.map((r) => ({ user_id: S.user.id, project_id: S.pid, ...r }));
  for (const r of full) S.reviews.set(r.entry_id, r);
  for (let i = 0; i < full.length; i += 500) chk(await sb.from('lc_reviews').upsert(full.slice(i, i + 500), { onConflict: 'user_id,entry_id' }));
  emit({ kind: 'bulk' });
}

// ---------- 读法模板 ----------

export async function createTemplate(name, pattern) {
  const row = chk(await sb.from('lc_reading_templates').insert({ project_id: S.pid, name, rule: { pattern } }).select().single());
  S.templates.push(row); emit({ kind: 'templates' });
}
export async function deleteTemplate(id) {
  S.templates = S.templates.filter((t) => t.id !== id); emit({ kind: 'templates' });
  chk(await sb.from('lc_reading_templates').delete().eq('id', id));
}

// ---------- 自定义字体 ----------

const loadedFonts = new Set();
export async function loadFonts() {
  for (const f of S.project?.settings?.fonts || []) {
    if (loadedFonts.has(f.path)) continue;
    try {
      const blob = chk(await sb.storage.from('lc-fonts').download(f.path));
      const face = new FontFace(f.family, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      loadedFonts.add(f.path);
    } catch (e) { console.warn('font load failed', f, e); }
  }
}
export async function uploadFont(file, family) {
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${S.pid}/${Date.now()}-${safe}`;
  chk(await sb.storage.from('lc-fonts').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }));
  await updateSettings({ fonts: [...(S.project.settings.fonts || []), { family, path }] });
  await loadFonts();
}
export async function deleteFont(path) {
  await updateSettings({ fonts: (S.project.settings.fonts || []).filter((f) => f.path !== path) });
  await sb.storage.from('lc-fonts').remove([path]);
}
