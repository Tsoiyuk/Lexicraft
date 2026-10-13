import { S, onChange } from './store.js';
import { h, toast } from './ui.js';
import { T } from './i18n.js';

/** 项目设置里填写了特殊字符时，右下角出现一个可展开的字符键盘 */
export function mountKeyboard() {
  let panel = null, btn = null, lastInput = null;
  const onFocus = (e) => {
    const t = e.target;
    if (t.matches?.('textarea, input:not([type]), input[type=text], input[type=search]')) lastInput = t;
  };
  document.addEventListener('focusin', onFocus);
  const off = onChange((ev) => { if (ev.kind === 'project') draw(); });
  draw();

  function draw() {
    const open = panel && !panel.hidden;
    btn?.remove(); panel?.remove(); btn = panel = null;
    const cs = String(S.project?.settings?.keyboard || '').split(/\s+/).filter(Boolean);
    if (!cs.length) return;
    const font = S.project.settings.keyboardFont;
    panel = h('div', { class: 'kb-panel', hidden: !open, role: 'toolbar', 'aria-label': T('特殊字符', 'Special characters') },
      cs.map((c) => h('button', { type: 'button', class: 'kb-key', style: font ? `font-family:"${font}", var(--serif)` : null, onMousedown: (e) => e.preventDefault(), onClick: () => insert(c) }, c)));
    btn = h('button', { type: 'button', class: 'kb-toggle', 'aria-label': T('特殊字符键盘', 'Special character keyboard'), title: T('特殊字符键盘', 'Special character keyboard'), onMousedown: (e) => e.preventDefault(), onClick: () => { panel.hidden = !panel.hidden; } }, '⌨');
    document.body.append(panel, btn);
  }
  function insert(c) {
    const el = lastInput;
    if (!el || !document.contains(el)) { toast(T('请先点一下要输入的文本框', 'Click into a text field first')); return; }
    el.focus();
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    el.setRangeText(c, s, e, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return () => { document.removeEventListener('focusin', onFocus); off(); btn?.remove(); panel?.remove(); };
}
