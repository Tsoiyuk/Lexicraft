import { sb } from '../supabase.js';
import { h } from '../ui.js';
import { T } from '../i18n.js';
import { openJoin } from './home.js';

export function renderJoin(root, pid) {
  let alive = true;
  const box = h('section', { class: 'empty narrow' }, h('p', { class: 'muted' }, T('正在检查…', 'Checking…')));
  root.append(box);
  (async () => {
    const { data } = await sb.from('lc_projects').select('id').eq('id', pid).maybeSingle();
    if (!alive) return;
    if (data) { location.replace(`#/p/${pid}`); return; }
    box.replaceChildren(
      h('h2', {}, T('加入共享项目', 'Join a shared project')),
      h('p', {}, T('输入创建者给你的密钥，就能和大家一起编辑这个项目。', 'Enter the key the owner gave you to start editing this project together.')),
      h('button', { class: 'btn primary', onClick: () => openJoin(pid) }, T('输入密钥', 'Enter key')));
    openJoin(pid);
  })();
  return () => { alive = false; };
}
