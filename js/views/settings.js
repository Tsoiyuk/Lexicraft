import { S, onChange, isOwner, sortedTables, fieldsOf, updateProject, updateSettings, moveField, renameTable, deleteTable,
  createTag, updateTag, deleteTag, createTemplate, deleteTemplate, rotateKey, listMembers, removeMember, leaveProject, deleteProject,
  uploadFont, deleteFont, entriesOf } from '../store.js';
import { h, toast, confirmBox, copyText, errMsg, modal } from '../ui.js';
import { T } from '../i18n.js';
import { openFieldEditor, typeLabel, placementLabel, needsPlacement } from '../fieldEditor.js';
import { COLOR_KEYS, tagStyle, nextColor } from '../tags.js';

const TTS_LANGS = () => [['en-US', T('英语（美式）', 'English (US)')], ['en-GB', T('英语（英式）', 'English (UK)')], ['de-DE', T('德语', 'German')], ['fr-FR', T('法语', 'French')],
  ['es-ES', T('西班牙语', 'Spanish')], ['it-IT', T('意大利语', 'Italian')], ['ja-JP', T('日语', 'Japanese')], ['ko-KR', T('韩语', 'Korean')],
  ['zh-CN', T('普通话', 'Mandarin')], ['zh-HK', T('粤语', 'Cantonese')], ['ru-RU', T('俄语', 'Russian')], ['pt-BR', T('葡萄牙语', 'Portuguese')]];

export function renderSettings(root) {
  const pid = S.pid;
  let pending = false;
  let shownKey = null;
  const membersBox = h('div', { class: 'members' }, h('p', { class: 'muted' }, T('加载中…', 'Loading…')));

  const panel = (title, desc, ...body) => h('section', { class: 'panel' }, h('h2', {}, title), desc ? h('p', { class: 'sub' }, desc) : null, ...body);
  const fld = (label, el, hint) => h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, label), el, hint ? h('span', { class: 'hint' }, hint) : null);
  const st = () => S.project.settings;

  function general() {
    const name = h('input', { type: 'text', value: S.project.name });
    name.addEventListener('change', () => { const v = name.value.trim(); if (v && v !== S.project.name) updateProject({ name: v }).then(() => toast(T('已保存', 'Saved'))).catch((e) => toast(errMsg(e))); });
    const lang = h('input', { type: 'text', value: S.project.language || '' });
    lang.addEventListener('change', () => updateProject({ language: lang.value.trim() || null }).catch((e) => toast(errMsg(e))));
    return panel(T('基本信息', 'General'), null, h('div', { class: 'grid2' }, fld(T('项目名称', 'Project name'), name), fld(T('语言', 'Language'), lang)));
  }

  function fieldsPanel() {
    const out = [];
    for (const t of sortedTables()) {
      const rows = fieldsOf(t.id).map((f, i, arr) => h('div', { class: 'field-row' },
        h('span', { class: 'fr-name', style: null }, f.label),
        h('span', { class: 'fr-type' }, typeLabel(f.type)),
        needsPlacement(t.id) ? h('span', { class: 'fr-place' }, placementLabel(f.options?.placement || 'sense')) : h('span'),
        h('span', { class: 'fr-actions' },
          h('button', { class: 'icon-btn', title: T('上移', 'Move up'), 'aria-label': T('上移', 'Move up'), disabled: i === 0, onClick: () => moveField(f.id, -1) }, '↑'),
          h('button', { class: 'icon-btn', title: T('下移', 'Move down'), 'aria-label': T('下移', 'Move down'), disabled: i === arr.length - 1, onClick: () => moveField(f.id, 1) }, '↓'),
          h('button', { class: 'btn ghost small', onClick: () => openFieldEditor({ field: f }) }, T('编辑', 'Edit')))));
      const tableHead = S.project.kind === 'dictionary'
        ? h('div', { class: 'table-head' },
          h('h3', {}, t.name, h('span', { class: 'muted small' }, ` ${entriesOf(t.id).length} ${T('行', 'rows')}`)),
          h('span', { class: 'row' },
            h('button', { class: 'btn ghost small', onClick: () => renameTableDlg(t) }, T('重命名', 'Rename')),
            sortedTables().length > 1 ? h('button', { class: 'btn ghost small danger-text', onClick: () => delTable(t) }, T('删除表格', 'Delete table')) : null))
        : null;
      out.push(h('div', { class: 'table-block' }, tableHead, h('div', { class: 'field-list' }, rows.length ? rows : h('p', { class: 'muted' }, T('还没有列。', 'No columns yet.'))),
        h('button', { class: 'btn ghost small', onClick: () => openFieldEditor({ tableId: t.id }) }, T('＋ 添加列', '+ Add column'))));
    }
    return panel(S.project.kind === 'deck' ? T('卡片的栏位', 'Card fields') : T('表格与列', 'Tables and columns'),
      S.project.kind === 'deck' ? T('每个单词要记录哪些内容。翻面顺序在下一节设置。', 'What each word records. Set the face order in the next section.')
        : T('「位置」决定这一列显示在词条页的哪里，可以参考 Wiktionary 的版式。', '“Position” decides where a column appears on the entry page, Wiktionary-style.'), ...out);
  }
  function renameTableDlg(t) {
    const name = h('input', { type: 'text', value: t.name });
    modal({ title: T('重命名表格', 'Rename table'), body: h('div', { class: 'form' }, fld(T('名称', 'Name'), name)),
      actions: [{ label: T('取消', 'Cancel'), onClick: (c) => c() }, { label: T('保存', 'Save'), kind: 'primary', onClick: async (c) => { if (name.value.trim()) await renameTable(t.id, name.value.trim()); c(); } }] });
  }
  async function delTable(t) {
    const n = entriesOf(t.id).length;
    if (!(await confirmBox(T(`删除表格「${t.name}」和其中的 ${n} 行数据？此操作无法撤销。`, `Delete the table “${t.name}” and its ${n} rows? This cannot be undone.`), { danger: true, okLabel: T('删除', 'Delete') }))) return;
    if (st().charTable?.tableId === t.id) await updateSettings({ charTable: null });
    await deleteTable(t.id);
  }

  function facesPanel() {
    const t = sortedTables()[0];
    const fl = fieldsOf(t.id);
    let faces = (st().faces || []).map((f) => f.filter((k) => fl.some((x) => x.key === k)));
    if (!faces.length) faces = [[fl[0]?.key].filter(Boolean), fl.slice(1).map((f) => f.key)];
    const save = (next) => updateSettings({ faces: next }).catch((e) => toast(errMsg(e)));
    const list = faces.map((face, i) => h('div', { class: 'face-edit' },
      h('div', { class: 'face-edit-head' },
        h('strong', {}, i === 0 ? T('第 1 面（提问）', 'Face 1 (prompt)') : T(`第 ${i + 1} 面`, `Face ${i + 1}`)),
        h('span', { class: 'row' },
          h('button', { class: 'icon-btn', disabled: i === 0, 'aria-label': T('上移', 'Move up'), onClick: () => { const n = [...faces]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n); } }, '↑'),
          h('button', { class: 'icon-btn', disabled: i === faces.length - 1, 'aria-label': T('下移', 'Move down'), onClick: () => { const n = [...faces]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; save(n); } }, '↓'),
          faces.length > 1 ? h('button', { class: 'icon-btn', 'aria-label': T('删除这一面', 'Remove face'), onClick: () => save(faces.filter((_, j) => j !== i)) }, '✕') : null)),
      h('div', { class: 'chips' }, fl.map((f) => {
        const on = face.includes(f.key);
        return h('button', { type: 'button', class: 'opt' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => {
          const n = faces.map((x) => x.filter((k) => k !== f.key));
          if (!on) n[i] = [...n[i], f.key].sort((a, b) => fl.findIndex((x) => x.key === a) - fl.findIndex((x) => x.key === b));
          save(n);
        } }, f.label);
      }))));
    const unused = fl.filter((f) => !faces.some((x) => x.includes(f.key)));
    const newPer = h('input', { type: 'number', min: 0, max: 999, value: st().newPerDay ?? 20 });
    newPer.addEventListener('change', () => updateSettings({ newPerDay: Math.max(0, Math.min(999, parseInt(newPer.value, 10) || 0)) }));
    const ttsLang = h('select', {}, TTS_LANGS().map(([v, l]) => h('option', { value: v, selected: st().ttsLang === v }, l)));
    ttsLang.addEventListener('change', () => updateSettings({ ttsLang: ttsLang.value }));
    const ttsField = h('select', {}, h('option', { value: '' }, T('不朗读', 'No speech')), fl.map((f) => h('option', { value: f.key, selected: st().ttsField === f.key }, f.label)));
    ttsField.addEventListener('change', () => updateSettings({ ttsField: ttsField.value || null }));
    return panel(T('翻面顺序', 'Faces'), T('复习时依序翻开每一面，最后一面翻开后再评分。一面可以放好几栏。', 'Faces are revealed one by one; you rate after the last. A face can hold several fields.'),
      ...list,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', onClick: () => save([...faces, []]) }, T('＋ 添加一面', '+ Add face'))),
      unused.length ? h('p', { class: 'hint' }, T('不会出现在卡片上的栏位：', 'Fields not shown on cards: ') + unused.map((f) => f.label).join(T('、', ', '))) : null,
      h('div', { class: 'grid3' }, fld(T('每日新词数', 'New words per day'), newPer), fld(T('朗读语言', 'Speech language'), ttsLang), fld(T('朗读哪一栏', 'Field to read aloud'), ttsField)));
  }

  function readingsPanel() {
    const types = h('textarea', { rows: 3, placeholder: T('每行一种，例如：\nkengtenum\nhundok', 'One per line, e.g.\nkengtenum\nhundok') });
    types.value = (st().readingTypes || []).join('\n');
    types.addEventListener('change', () => updateSettings({ readingTypes: [...new Set(types.value.split('\n').map((s) => s.trim()).filter(Boolean))] }));
    const ct = st().charTable || {};
    const tSel = h('select', {}, h('option', { value: '' }, T('不使用字元表', 'No character table')), sortedTables().map((t) => h('option', { value: t.id, selected: ct.tableId === t.id }, t.name)));
    const fsOf = (tid) => (tid ? fieldsOf(tid) : []);
    const fSel = (cur) => h('select', {}, h('option', { value: '' }, '—'), fsOf(ct.tableId).map((f) => h('option', { value: f.key, selected: cur === f.key }, f.label)));
    const cSel = fSel(ct.charKey), rSel = fSel(ct.readingKey), tySel = fSel(ct.typeKey);
    const saveCT = () => updateSettings({ charTable: tSel.value ? { tableId: tSel.value, charKey: cSel.value, readingKey: rSel.value, typeKey: tySel.value } : null });
    tSel.addEventListener('change', () => { updateSettings({ charTable: tSel.value ? { tableId: tSel.value, charKey: '', readingKey: '', typeKey: '' } : null }); });
    [cSel, rSel, tySel].forEach((s) => s.addEventListener('change', saveCT));

    const tplName = h('input', { type: 'text', placeholder: T('例如：全部 kengtenum', 'e.g. All kengtenum') });
    const tplPat = h('input', { type: 'text', placeholder: T('例如：kengtenum hundok', 'e.g. kengtenum hundok') });
    const tplList = S.templates.length ? h('ul', { class: 'tpl-list' }, S.templates.map((t) => h('li', {},
      h('strong', {}, t.name), h('span', { class: 'mono' }, (t.rule?.pattern || []).join(' → ')),
      h('button', { class: 'icon-btn', 'aria-label': T('删除', 'Delete'), onClick: () => deleteTemplate(t.id) }, '✕')))) : h('p', { class: 'muted' }, T('还没有模板。', 'No templates yet.'));
    return panel(T('读音与字元表', 'Readings and characters'),
      T('逐字拆解里每个字的读音都由编写者自己决定。字元表登记每个字可能的读法，输入时会作为提示；读法模板可以一次套用一串有规律的读法类型。', 'Readings in a character breakdown are always chosen by the author. The character table lists each character’s possible readings as suggestions, and templates apply a regular pattern of reading types in one go.'),
      fld(T('读法类型', 'Reading types'), types, T('逐字拆解和字元表的下拉选项都会用这份列表。', 'Used by character breakdowns and the character table.')),
      h('h3', {}, T('字元表', 'Character table')),
      h('div', { class: 'grid2' }, fld(T('使用哪张表', 'Table'), tSel), fld(T('「字符」列', '“Character” column'), cSel), fld(T('「读音」列', '“Reading” column'), rSel), fld(T('「读法类型」列', '“Reading type” column'), tySel)),
      h('h3', {}, T('读法模板', 'Reading templates')),
      tplList,
      h('div', { class: 'grid2 tpl-add' }, fld(T('模板名称', 'Name'), tplName), fld(T('读法类型顺序', 'Type pattern'), tplPat, T('用空格分隔，第 1 个用于第 1 个字，依此类推；字数更多时重复最后一个。', 'Space-separated: the 1st applies to the 1st character and so on; the last repeats for longer words.'))),
      h('button', { class: 'btn ghost small', onClick: async () => {
        const pat = tplPat.value.split(/\s+/).filter(Boolean);
        if (!tplName.value.trim() || !pat.length) { toast(T('请填写名称和读法类型', 'Enter a name and a pattern')); return; }
        await createTemplate(tplName.value.trim(), pat);
      } }, T('添加模板', 'Add template')));
  }

  function typingPanel() {
    const kb = h('textarea', { rows: 2, placeholder: T('用空格分隔，例如：á é í ó ú ɹ ə ŋ ʔ', 'Space-separated, e.g. á é í ó ú ɹ ə ŋ ʔ') });
    kb.value = st().keyboard || '';
    kb.addEventListener('change', () => updateSettings({ keyboard: kb.value.trim() }));
    const fonts = st().fonts || [];
    const kbFont = h('select', {}, h('option', { value: '' }, T('默认字体', 'Default font')), fonts.map((f) => h('option', { value: f.family, selected: st().keyboardFont === f.family }, f.family)));
    kbFont.addEventListener('change', () => updateSettings({ keyboardFont: kbFont.value || null }));
    const file = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2' });
    const fam = h('input', { type: 'text', placeholder: T('字体名称，例如 AkarmianScript', 'Font name, e.g. AkarmianScript') });
    const fontList = fonts.length ? h('ul', { class: 'font-list' }, fonts.map((f) => h('li', {},
      h('span', { style: `font-family:"${f.family}", var(--serif)`, class: 'font-sample' }, f.family + '　Aa あ 字'),
      h('button', { class: 'icon-btn', 'aria-label': T('删除', 'Delete'), onClick: async () => { if (await confirmBox(T(`删除字体「${f.family}」？`, `Delete the font “${f.family}”?`), { danger: true })) deleteFont(f.path); } }, '✕')))) : null;
    return panel(T('输入与字体', 'Typing and fonts'), T('自创文字或特殊符号可以上传字体，再在列设置里指定哪一列使用它。', 'Upload a font for a custom script, then choose it in a column’s settings.'),
      fld(T('特殊字符键盘', 'Special character keyboard'), kb, T('填写后，右下角会出现 ⌨ 按钮，点击即可插入字符。', 'Once filled in, a ⌨ button appears at the bottom right for inserting characters.')),
      fonts.length ? fld(T('键盘使用的字体', 'Keyboard font'), kbFont) : null,
      h('h3', {}, T('自定义字体', 'Custom fonts')), fontList,
      h('div', { class: 'grid2' }, fld(T('字体文件（.ttf .otf .woff .woff2，最大 10MB）', 'Font file (.ttf .otf .woff .woff2, up to 10 MB)'), file), fld(T('字体名称', 'Font name'), fam)),
      h('button', { class: 'btn ghost small', onClick: async (ev) => {
        const f = file.files[0];
        if (!f || !fam.value.trim()) { toast(T('请选择文件并填写名称', 'Choose a file and enter a name')); return; }
        if (fonts.some((x) => x.family === fam.value.trim())) { toast(T('已有同名字体', 'A font with this name exists')); return; }
        ev.target.disabled = true;
        try { await uploadFont(f, fam.value.trim().replace(/["'\\<>;]/g, '')); toast(T('字体已上传', 'Font uploaded')); } catch (e) { toast(errMsg(e)); } finally { ev.target.disabled = false; }
      } }, T('上传字体', 'Upload font')));
  }

  function tagsPanel() {
    const name = h('input', { type: 'text', placeholder: T('新标签名称', 'New tag name') });
    const add = async () => {
      const v = name.value.trim(); if (!v) return;
      if (S.tags.some((t) => t.name === v)) { toast(T('已有同名标签', 'That tag already exists')); return; }
      try { await createTag(v, nextColor(S.tags.length)); name.value = ''; } catch (e) { toast(errMsg(e)); }
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return panel(T('标签', 'Tags'), T('给单词或词条分类，例如课次、词性、考试重点。点色块可以换颜色。', 'Group words by lesson, topic or anything else. Click a swatch to change colour.'),
      h('div', { class: 'tag-list' }, S.tags.map((t) => {
        const rn = h('input', { type: 'text', value: t.name, class: 'tag-name', 'aria-label': T('标签名称', 'Tag name') });
        rn.addEventListener('change', () => { const v = rn.value.trim(); if (v && v !== t.name) updateTag(t.id, { name: v }).catch((e) => toast(errMsg(e))); });
        return h('div', { class: 'tag-edit' },
          h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': T('颜色', 'Colour') }, COLOR_KEYS.map((c) => h('button', { type: 'button', class: 'swatch' + (t.color === c ? ' on' : ''), style: tagStyle(c), role: 'radio', 'aria-checked': String(t.color === c), 'aria-label': c, onClick: () => updateTag(t.id, { color: c }) }))),
          rn,
          h('button', { class: 'icon-btn', 'aria-label': T('删除标签', 'Delete tag'), onClick: async () => { if (await confirmBox(T(`删除标签「${t.name}」？单词本身不会被删除。`, `Delete the tag “${t.name}”? The words themselves stay.`), { danger: true, okLabel: T('删除', 'Delete') })) deleteTag(t.id); } }, '✕'));
      })),
      h('div', { class: 'row' }, name, h('button', { class: 'btn ghost', onClick: add }, T('添加', 'Add'))));
  }

  function sharingPanel() {
    const link = `${location.origin}${location.pathname}#/join/${pid}`;
    const keyBox = shownKey
      ? h('div', { class: 'key-box' }, h('code', { class: 'key' }, shownKey),
        h('button', { class: 'btn ghost small', onClick: async () => { await copyText(shownKey); toast(T('已复制密钥', 'Key copied')); } }, T('复制', 'Copy')),
        h('p', { class: 'hint' }, T('密钥只显示这一次。忘记了也没关系，再刷新一次即可；已经加入的成员不受影响。', 'The key is shown only once. If you lose it, refresh it again; existing members are not affected.')))
      : null;
    return panel(T('共享与协作', 'Sharing'), T('项目默认不公开。把邀请链接和密钥一起发给朋友，对方登录后输入密钥，就能和你一起编辑。', 'Projects are private. Send a friend the invite link together with the key; after signing in and entering the key, they can edit with you.'),
      fld(T('邀请链接', 'Invite link'), h('div', { class: 'row' }, h('input', { type: 'text', value: link, readonly: true, class: 'mono', onFocus: (e) => e.target.select() }),
        h('button', { class: 'btn ghost small', onClick: async () => { await copyText(link); toast(T('已复制链接', 'Link copied')); } }, T('复制', 'Copy')))),
      isOwner()
        ? h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('密钥', 'Key')),
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onClick: async () => {
            if (!(await confirmBox(T('生成新密钥后，旧密钥立刻失效（已加入的成员不受影响）。继续？', 'A new key immediately replaces the old one (existing members stay). Continue?'), { okLabel: T('生成', 'Generate') }))) return;
            try { shownKey = await rotateKey(); draw(); } catch (e) { toast(errMsg(e)); }
          } }, T('生成 / 刷新密钥', 'Generate / refresh key'))), keyBox)
        : h('p', { class: 'hint' }, T('只有项目创建者可以管理密钥。', 'Only the project owner can manage the key.')),
      h('h3', {}, T('成员', 'Members')), membersBox);
  }
  async function loadMembers() {
    try {
      const ms = await listMembers();
      membersBox.replaceChildren(h('ul', { class: 'member-list' }, ms.map((m) => h('li', {},
        h('span', {}, m.email || m.user_id), h('span', { class: 'muted small' }, m.role === 'owner' ? T('创建者', 'Owner') : T('编辑者', 'Editor')),
        isOwner() && m.role !== 'owner' ? h('button', { class: 'btn ghost small danger-text', onClick: async () => {
          if (!(await confirmBox(T(`移除 ${m.email}？对方将无法再打开这个项目。`, `Remove ${m.email}? They will no longer be able to open this project.`), { danger: true, okLabel: T('移除', 'Remove') }))) return;
          await removeMember(m.user_id); loadMembers();
        } }, T('移除', 'Remove')) : h('span')))));
    } catch (e) { membersBox.replaceChildren(h('p', { class: 'error' }, errMsg(e))); }
  }

  function dangerPanel() {
    if (isOwner()) return panel(T('删除项目', 'Delete project'), T('项目里的所有表格、词条、标签和所有人的复习进度都会被永久删除。', 'All tables, entries, tags and everyone’s review progress will be permanently deleted.'),
      h('button', { class: 'btn danger', onClick: async () => {
        const input = h('input', { type: 'text', placeholder: S.project.name });
        modal({ title: T('删除项目', 'Delete project'), body: h('div', { class: 'form' }, h('p', {}, T(`请输入项目名称「${S.project.name}」以确认。`, `Type the project name “${S.project.name}” to confirm.`)), input),
          actions: [{ label: T('取消', 'Cancel'), onClick: (c) => c() }, { label: T('永久删除', 'Delete forever'), kind: 'danger', onClick: async (c) => {
            if (input.value.trim() !== S.project.name) { toast(T('名称不一致', 'The name does not match')); return; }
            await deleteProject(); c(); location.hash = '#/';
          } }] });
      } }, T('删除这个项目', 'Delete this project')));
    return panel(T('退出项目', 'Leave project'), T('退出后，你的复习进度会保留在服务器上，但你将无法再打开这个项目，除非重新用密钥加入。', 'After leaving you can no longer open this project unless you join again with a key.'),
      h('button', { class: 'btn danger', onClick: async () => { if (await confirmBox(T('退出这个项目？', 'Leave this project?'), { danger: true, okLabel: T('退出', 'Leave') })) { await leaveProject(); location.hash = '#/'; } } }, T('退出项目', 'Leave project')));
  }

  function draw() {
    pending = false;
    const y = window.scrollY;
    root.replaceChildren(h('div', { class: 'settings' },
      general(), fieldsPanel(),
      S.project.kind === 'deck' ? facesPanel() : readingsPanel(),
      tagsPanel(), typingPanel(), sharingPanel(), dangerPanel()));
    window.scrollTo(0, y);
  }
  const busy = () => { const a = document.activeElement; return a && root.contains(a) && a.matches('input, textarea, select'); };
  const schedule = () => { if (busy()) pending = true; else draw(); };
  root.addEventListener('focusout', () => setTimeout(() => { if (pending && !busy()) draw(); }, 0));
  const off = onChange((ev) => { if (['fields', 'tables', 'tags', 'project', 'templates'].includes(ev.kind)) schedule(); });
  draw(); loadMembers();
  return () => off();
}
