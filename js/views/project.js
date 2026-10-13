import { S, loadProject, loadFonts, onChange } from '../store.js';
import { h, errMsg } from '../ui.js';
import { T } from '../i18n.js';
import { mountKeyboard } from '../keyboard.js';
import { renderReview } from './review.js';
import { renderWords } from './words.js';
import { renderBrowse } from './browse.js';
import { renderTable } from './table.js';
import { renderSettings } from './settings.js';

const VIEWS = { review: renderReview, words: renderWords, browse: renderBrowse, table: renderTable, settings: renderSettings };

export function renderProject(root, pid, tab, rest) {
  let disposed = false;
  const cleanups = [];
  const box = h('div', { class: 'project' });
  root.append(box);
  (async () => {
    if (S.pid !== pid) {
      box.replaceChildren(h('p', { class: 'muted pad' }, T('加载中…', 'Loading…')));
      let ok = false;
      try { ok = await loadProject(pid); } catch (e) { console.error(e); if (!disposed) box.replaceChildren(h('p', { class: 'error pad' }, errMsg(e))); return; }
      if (disposed) return;
      if (!ok) {
        box.replaceChildren(h('div', { class: 'empty narrow' },
          h('h2', {}, T('打不开这个项目', 'This project is unavailable')),
          h('p', {}, T('它可能已被删除，或者你还不是成员。如果有邀请链接和密钥，可以先加入。', 'It may have been deleted, or you are not a member yet. If you have an invite link and key, join first.')),
          h('div', { class: 'row center' }, h('a', { class: 'btn ghost', href: '#/' }, T('回到我的项目', 'Back to my projects')), h('a', { class: 'btn primary', href: `#/join/${pid}` }, T('输入密钥加入', 'Join with a key')))));
        return;
      }
    }
    const kind = S.project.kind;
    const tabs = kind === 'deck'
      ? [['review', T('复习', 'Review')], ['words', T('词库', 'Words')], ['settings', T('设置', 'Settings')]]
      : [['browse', T('查阅', 'Browse')], ['table', T('表格', 'Table')], ['settings', T('设置', 'Settings')]];
    if (!tabs.some((t) => t[0] === tab)) tab = tabs[0][0];
    const title = h('h1', { class: 'proj-title' }, S.project.name);
    cleanups.push(onChange((ev) => { if (ev.kind === 'project') title.textContent = S.project.name; }));
    const head = h('div', { class: 'proj-head' },
      h('a', { class: 'back', href: '#/', 'aria-label': T('我的项目', 'My projects'), title: T('我的项目', 'My projects') }, '←'),
      h('div', { class: 'proj-title-wrap' }, h('span', { class: 'kind-label' }, kind === 'deck' ? T('闪卡', 'Flashcards') : T('词典', 'Dictionary')), title),
      h('nav', { class: 'tabs', 'aria-label': T('项目页面', 'Project sections') }, tabs.map(([k, l]) => h('a', { href: `#/p/${pid}/${k}`, 'aria-current': k === tab ? 'page' : null }, l))));
    const view = h('div', { class: 'view view-' + tab });
    box.replaceChildren(head, view);
    loadFonts();
    cleanups.push(mountKeyboard());
    const c = VIEWS[tab](view, rest);
    if (c) cleanups.push(c);
  })();
  return () => { disposed = true; cleanups.forEach((f) => { try { f && f(); } catch (e) {} }); };
}
