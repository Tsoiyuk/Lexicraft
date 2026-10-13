import { esc } from './ui.js';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** 行内标记：[[词条]]、[[词条|显示文字]]、**粗体**、*斜体* */
export function inline(raw, linkHref) {
  let s = esc(raw);
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (m, target, label) =>
    linkHref
      ? `<a class="wl" href="${esc(linkHref(unesc(target.trim())))}">${label || target}</a>`
      : `<span class="wl-plain">${label || target}</span>`);
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>');
  return s;
}

/**
 * 长文本：
 *  numbered=true 时，每行一条释义并自动编号；以「:」开头的行是上一条释义的例句。
 *  否则按空行分段；以「- 」开头的行组成列表。
 */
export function renderLong(text, { numbered = false, linkHref = null } = {}) {
  const src = String(text).replace(/\r\n?/g, '\n');
  if (numbered) {
    const items = []; const pre = [];
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith(':')) {
        const ex = `<div class="ex">${inline(t.slice(1).trim(), linkHref)}</div>`;
        if (items.length) items[items.length - 1] += ex; else pre.push(ex);
      } else items.push(inline(t.replace(/^(#|\d+[.)、])\s*/, ''), linkHref));
    }
    return pre.join('') + (items.length ? `<ol class="senses">${items.map((i) => `<li>${i}</li>`).join('')}</ol>` : '');
  }
  return src.split(/\n\s*\n/).map((b) => {
    const ls = b.split('\n').filter((l) => l.trim());
    if (!ls.length) return '';
    if (ls.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${ls.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''), linkHref)}</li>`).join('')}</ul>`;
    return `<p>${ls.map((l) => inline(l.trim(), linkHref)).join('<br>')}</p>`;
  }).join('');
}
