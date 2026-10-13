const KEY = 'lc-lang';
let lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

/** T('中文', 'English') */
export const T = (zh, en) => (lang === 'zh' ? zh : en);
export const getLang = () => lang;
export const locale = () => (lang === 'zh' ? 'zh-CN' : 'en');
export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch (e) {}
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
}
