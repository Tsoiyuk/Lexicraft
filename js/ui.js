import { T } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 用于搜索：去掉重音符号、统一大小写 */
export const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

export const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** actions: [{label, kind: 'primary'|'ghost'|'danger', left, onClick: async (close) => {}}] */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const prev = document.activeElement;
  const overlay = h('div', { class: 'overlay' });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose && onClose();
    if (prev && prev.focus && document.contains(prev)) prev.focus();
  }
  function onKey(e) { if (e.key === 'Escape' && document.body.lastElementChild === overlay) { e.stopPropagation(); close(); } }
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    const b = h('button', { class: 'btn ' + (a.kind || 'ghost') + (a.left ? ' left' : ''), type: 'button' }, a.label);
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      try { await a.onClick?.(close); } catch (err) { console.error(err); toast(errMsg(err)); }
      finally { b.disabled = false; }
    });
    foot.append(b);
  }
  box.append(
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: close }, '✕')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null
  );
  overlay.append(box);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => { const f = box.querySelector('.modal-body input:not([type=checkbox]):not([type=radio]):not([type=file]), .modal-body textarea, .modal-body select'); f && f.focus(); }, 30);
  return { close, box };
}

export function confirmBox(message, { okLabel, cancelLabel, danger = false, title } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title: title || '',
      body: h('p', { class: 'confirm-text' }, message),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: cancelLabel || T('取消', 'Cancel'), kind: 'ghost', onClick: (close) => close() },
        { label: okLabel || T('确定', 'OK'), kind: danger ? 'danger' : 'primary', onClick: (close) => { done = true; resolve(true); close(); } },
      ],
    });
    return m;
  });
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text;
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}
