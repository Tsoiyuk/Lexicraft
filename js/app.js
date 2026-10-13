import { sb } from './supabase.js';
import { CONFIGURED } from './config.js';
import { S, resetProject } from './store.js';
import { h, confirmBox } from './ui.js';
import { T, getLang, setLang } from './i18n.js';
import { renderAuth, openRecovery } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderJoin } from './views/join.js';
import { renderProject } from './views/project.js';

const app = document.getElementById('app');
let session = null;
let cleanup = null;
let recoveryPending = /type=recovery/.test(location.hash);
let routeTimer = 0;

sb.auth.onAuthStateChange((event, s) => {
  const had = !!session;
  session = s; S.user = s?.user ?? null;
  if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
  if (recoveryPending && s) { recoveryPending = false; setTimeout(openRecovery, 0); }
  if ((event === 'SIGNED_IN' && !had) || event === 'SIGNED_OUT') {
    if (event === 'SIGNED_OUT') resetProject();
    clearTimeout(routeTimer); routeTimer = setTimeout(route, 0);
  }
});

function header() {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'Lx'), 'LexiCraft'),
    h('div', { class: 'topbar-right' },
      h('button', { class: 'btn ghost small', type: 'button', onClick: () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); route(); } }, getLang() === 'zh' ? 'English' : '中文'),
      session ? h('button', { class: 'btn ghost small', type: 'button', title: session.user.email, onClick: async () => {
        if (await confirmBox(T(`退出登录 ${session.user.email}？`, `Sign out of ${session.user.email}?`), { okLabel: T('退出登录', 'Sign out') })) await sb.auth.signOut();
      } }, T('退出', 'Sign out')) : null));
}

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (/(access_token|error_description|error_code)=/.test(raw)) return;
  const parts = raw.split('?')[0].split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  const main = h('main', { class: 'main' });
  app.replaceChildren(header(), main);

  if (!session) {
    if (parts[0] === 'join' || parts[0] === 'p') sessionStorage.setItem('lc-return', '#/' + parts.map(encodeURIComponent).join('/'));
    cleanup = renderAuth(main, { joining: parts[0] === 'join' });
    return;
  }
  const ret = sessionStorage.getItem('lc-return');
  if (ret) { sessionStorage.removeItem('lc-return'); if (ret !== location.hash) { location.hash = ret; return; } }

  document.title = 'LexiCraft';
  if (parts[0] === 'join' && parts[1]) cleanup = renderJoin(main, parts[1]);
  else if (parts[0] === 'p' && parts[1]) {
    main.classList.add('wide');
    cleanup = renderProject(main, parts[1], parts[2], parts.slice(3));
  } else {
    if (parts.length) { location.replace('#/'); return; }
    cleanup = renderHome(main);
  }
}

async function start() {
  if (!CONFIGURED) {
    app.replaceChildren(h('main', { class: 'main' }, h('div', { class: 'empty narrow' },
      h('h1', {}, 'LexiCraft'),
      h('p', {}, '还没有设置 Supabase。请打开 js/config.js，填入 SUPABASE_URL 和 SUPABASE_ANON_KEY。'),
      h('p', { class: 'muted' }, 'Supabase is not configured yet. Fill in SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js.'))));
    return;
  }
  const { data } = await sb.auth.getSession();
  session = data.session; S.user = session?.user ?? null;
  if (/(access_token|error_description|type=recovery)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/');
  if (recoveryPending && session) { recoveryPending = false; openRecovery(); }
  window.addEventListener('hashchange', route);
  route();
}
start();
