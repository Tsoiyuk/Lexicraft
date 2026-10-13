import { S } from './store.js';
import { esc } from './ui.js';
import { renderLong, inline } from './markup.js';

export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** 字段若指定了自定义字体，返回 style 字符串 */
export function fontStyle(f) {
  const fam = f?.options?.font;
  return fam ? `font-family:"${String(fam).replace(/["'\\<>;]/g, '')}", var(--serif)` : '';
}

/** 值 → 纯文本（搜索、列表、CSV 用） */
export function valueToText(f, v) {
  if (isEmpty(v)) return '';
  switch (f.type) {
    case 'multi_select': return Array.isArray(v) ? v.join('; ') : String(v);
    case 'char_breakdown': return Array.isArray(v) ? v.map((x) => [x.c, x.r || '', x.t || ''].join(':').replace(/:+$/, '')).join(' ') : String(v);
    default: return String(v);
  }
}

/** 纯文本 → 值（导入、表格粘贴用） */
export function textToValue(f, s) {
  s = String(s ?? '').trim();
  if (!s) return null;
  switch (f.type) {
    case 'number': { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; }
    case 'multi_select': return s.split(/\s*[;；,，]\s*/).filter(Boolean);
    case 'char_breakdown': return s.split(/\s+/).map((tok) => { const [c, r = '', t = ''] = tok.split(':'); return { c, r, t }; }).filter((x) => x.c);
    default: return s;
  }
}

export function linkHref(target) { return `#/p/${S.pid}/browse/${encodeURIComponent(target)}`; }
const hrefFn = () => (S.project?.kind === 'dictionary' ? linkHref : null);

/** 值 → HTML（词条页、闪卡用） */
export function valueHTML(f, v, { numbered = false } = {}) {
  if (isEmpty(v)) return '';
  const lh = hrefFn();
  switch (f.type) {
    case 'long_text': return renderLong(String(v), { numbered, linkHref: lh });
    case 'entry_link': return String(v).split(/\s*[,，;；]\s*/).filter(Boolean).map((w) => (lh ? `<a class="wl" href="${esc(lh(w))}">${esc(w)}</a>` : esc(w))).join(', ');
    case 'multi_select': return (Array.isArray(v) ? v : [v]).map(esc).join(', ');
    case 'char_breakdown': return Array.isArray(v) ? v.map((x) => `${esc(x.c)}${x.r ? ` <span class="muted">${esc(x.r)}</span>` : ''}`).join('　') : esc(v);
    case 'number': return esc(v);
    default: return inline(String(v), lh);
  }
}
