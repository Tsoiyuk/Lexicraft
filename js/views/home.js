import { S, listProjects, createProject, joinProject } from '../store.js';
import { h, modal, toast } from '../ui.js';
import { T, locale } from '../i18n.js';
import { getPresets } from '../presets.js';

export function renderHome(root) {
  let alive = true;
  const list = h('div', { class: 'proj-grid' }, h('p', { class: 'muted' }, T('加载中…', 'Loading…')));
  root.append(h('section', { class: 'home' },
    h('div', { class: 'home-head' },
      h('h1', { class: 'page-title' }, T('我的项目', 'My projects')),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onClick: () => openJoin() }, T('加入项目', 'Join a project')),
        h('button', { class: 'btn primary', onClick: openCreate }, T('新建项目', 'New project')))),
    list));
  load();

  async function load() {
    let data;
    try { data = await listProjects(); } catch (e) { if (alive) list.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
    if (!alive) return;
    if (!data.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, T('还没有项目', 'No projects yet')),
        h('p', {}, T('闪卡项目用来背单词，词典项目用来整理和查阅一门语言。', 'Flashcard projects are for memorising words. Dictionary projects are for building and browsing a language.')),
        h('button', { class: 'btn primary', onClick: openCreate }, T('新建第一个项目', 'Create your first project'))));
      return;
    }
    const fmt = new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' });
    list.replaceChildren(...data.map((p) => h('a', { class: 'proj-card kind-' + p.kind, href: `#/p/${p.id}` },
      h('span', { class: 'kind' }, p.kind === 'deck' ? T('闪卡', 'Flashcards') : T('词典', 'Dictionary')),
      h('span', { class: 'proj-name' }, p.name),
      h('span', { class: 'proj-meta' },
        p.language ? h('span', {}, p.language) : null,
        h('span', {}, T(`${p.lc_entries?.[0]?.count ?? 0} 个词条`, `${p.lc_entries?.[0]?.count ?? 0} entries`)),
        p.owner_id !== S.user.id ? h('span', { class: 'shared' }, T('共享给我', 'Shared with me')) : null,
        h('span', {}, fmt.format(new Date(p.updated_at)))))));
  }
  return () => { alive = false; };
}

function openCreate() {
  const presets = getPresets();
  const name = h('input', { type: 'text', placeholder: T('例如：德语 B1、Akarmian 词典', 'e.g. German B1, Akarmian dictionary') });
  const lang = h('input', { type: 'text', placeholder: T('例如：德语', 'e.g. German') });
  let kind = 'deck';
  const preset = h('select');
  const kinds = h('div', { class: 'kind-pick' });
  const drawKinds = () => {
    kinds.replaceChildren(...[
      ['deck', T('闪卡', 'Flashcards'), T('自定义每张卡的面数，按间隔重复复习', 'Cards with custom faces, reviewed with spaced repetition')],
      ['dictionary', T('词典', 'Dictionary'), T('表格编辑、词条页面查阅，适合自创语言', 'Spreadsheet editing and entry pages, great for conlangs')],
    ].map(([k, t, d]) => h('button', { type: 'button', class: 'kind-opt' + (kind === k ? ' on' : ''), 'aria-pressed': String(kind === k), onClick: () => { kind = k; drawKinds(); drawPresets(); } }, h('strong', {}, t), h('span', {}, d))));
  };
  const drawPresets = () => preset.replaceChildren(...Object.entries(presets).filter(([, p]) => p.kind === kind).map(([k, p]) => h('option', { value: k }, p.label)));
  drawKinds(); drawPresets();
  modal({
    title: T('新建项目', 'New project'),
    body: h('div', { class: 'form' },
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('名称', 'Name')), name),
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('类型', 'Type')), kinds),
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('语言（可选）', 'Language (optional)')), lang),
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('起始模板', 'Starting template')), preset,
        h('span', { class: 'hint' }, T('之后可以在「设置」里随意增删列。', 'You can add or remove columns later in Settings.')))),
    actions: [
      { label: T('取消', 'Cancel'), onClick: (c) => c() },
      { label: T('创建', 'Create'), kind: 'primary', onClick: async (close) => {
        if (!name.value.trim()) { toast(T('请填写名称', 'Enter a name')); name.focus(); return; }
        const pid = await createProject({ name: name.value.trim(), kind, language: lang.value.trim(), preset: preset.value });
        close(); location.hash = `#/p/${pid}`;
      } },
    ],
  });
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function openJoin(pidKnown) {
  const link = h('input', { type: 'text', value: pidKnown ? `${location.origin}${location.pathname}#/join/${pidKnown}` : '', placeholder: T('粘贴邀请链接', 'Paste the invite link') });
  const key = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX', class: 'mono' });
  modal({
    title: T('加入项目', 'Join a project'),
    body: h('div', { class: 'form' },
      pidKnown ? null : h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('邀请链接', 'Invite link')), link),
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('密钥', 'Key')), key,
        h('span', { class: 'hint' }, T('向项目创建者索取。', 'Ask the project owner for it.')))),
    actions: [
      { label: T('取消', 'Cancel'), onClick: (c) => c() },
      { label: T('加入', 'Join'), kind: 'primary', onClick: async (close) => {
        const pid = (link.value.match(UUID) || [])[0];
        if (!pid) { toast(T('链接不正确', 'That link does not look right')); return; }
        if (!key.value.trim()) { toast(T('请填写密钥', 'Enter the key')); key.focus(); return; }
        const ok = await joinProject(pid, key.value);
        if (!ok) { toast(T('密钥不正确，或项目不存在', 'Wrong key, or the project does not exist')); return; }
        close(); toast(T('已加入', 'Joined')); location.hash = `#/p/${pid}`;
      } },
    ],
  });
}
