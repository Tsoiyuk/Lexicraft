import { S, wordsTable, fieldsOf, entriesOf, saveReview, onChange } from '../store.js';
import { schedule, startOfDay, relLabel, MIN } from '../srs.js';
import { h, toast, errMsg } from '../ui.js';
import { T } from '../i18n.js';
import { valueHTML, fontStyle, isEmpty } from '../render.js';
import { tagChip } from '../tags.js';

const canSpeak = 'speechSynthesis' in window;

export function renderReview(root) {
  const pid = S.pid;
  const table = wordsTable();
  let currentId = null, revealed = 0, lastRatedId = null;
  const revKey = 'lc-rev-' + pid, tfKey = 'lc-tf-' + pid;
  let reverse = localStorage.getItem(revKey) === '1';
  let tagFilter = new Set(JSON.parse(sessionStorage.getItem(tfKey) || '[]'));

  function faces() {
    const fl = fieldsOf(table.id);
    const keys = new Set(fl.map((f) => f.key));
    let fs = (S.project.settings.faces || []).map((f) => f.filter((k) => keys.has(k))).filter((f) => f.length);
    if (!fs.length && fl.length) fs = [[fl[0].key], fl.slice(1).map((f) => f.key)].filter((f) => f.length);
    return reverse ? [...fs].reverse() : fs;
  }

  function queue() {
    const now = Date.now(), today = startOfDay(now);
    let list = entriesOf(table.id);
    if (tagFilter.size) list = list.filter((e) => { const s = S.entryTags.get(e.id); return s && [...tagFilter].some((t) => s.has(t)); });
    const seen = [], fresh = [];
    for (const e of list) { const r = S.reviews.get(e.id); if (r?.first_seen) seen.push([e, r]); else fresh.push(e); }
    const newToday = [...S.reviews.values()].filter((r) => r.first_seen && Date.parse(r.first_seen) >= today).length;
    const allowance = Math.max(0, (S.project.settings.newPerDay ?? 20) - newToday);
    const due = seen.filter(([, r]) => Date.parse(r.due) <= now).sort((a, b) => Date.parse(a[1].due) - Date.parse(b[1].due));
    const soon = seen.filter(([, r]) => { const d = Date.parse(r.due); return d > now && d <= now + 20 * MIN && !r.interval_days; }).sort((a, b) => Date.parse(a[1].due) - Date.parse(b[1].due));
    const newOnes = fresh.slice(0, allowance);
    const future = seen.map(([, r]) => Date.parse(r.due)).filter((d) => d > now);
    return {
      list: [...due.map((x) => x[0]), ...newOnes, ...soon.map((x) => x[0])],
      dueCount: due.length + soon.length, newCount: newOnes.length, totalNew: fresh.length,
      nextDue: future.length ? Math.min(...future) : null, total: list.length,
    };
  }

  function pick(list) {
    if (currentId && list.some((e) => e.id === currentId)) return list.find((e) => e.id === currentId);
    const e = list.find((x) => x.id !== lastRatedId) || list[0] || null;
    currentId = e?.id || null; revealed = 0;
    return e;
  }

  function speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = S.project.settings.ttsLang || 'en-US'; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function draw() {
    const q = queue();
    const fs = faces();
    const controls = h('div', { class: 'review-controls' },
      h('button', { class: 'btn ghost small', 'aria-pressed': String(reverse), onClick: () => { reverse = !reverse; localStorage.setItem(revKey, reverse ? '1' : '0'); revealed = 0; draw(); } },
        reverse ? T('反向复习：开', 'Reverse: on') : T('反向复习：关', 'Reverse: off')));
    const tagRow = S.tags.length ? h('div', { class: 'chips review-tags' },
      h('span', { class: 'hint' }, T('只复习：', 'Only review:')),
      S.tags.map((t) => tagChip(t, { small: true, active: tagFilter.has(t.id), onClick: () => {
        tagFilter.has(t.id) ? tagFilter.delete(t.id) : tagFilter.add(t.id);
        sessionStorage.setItem(tfKey, JSON.stringify([...tagFilter])); currentId = null; draw();
      } }))) : null;

    if (!q.total) {
      root.replaceChildren(tagRow || '', h('div', { class: 'empty' },
        h('h2', {}, tagFilter.size ? T('这些标签下没有单词', 'No words with these tags') : T('还没有单词', 'No words yet')),
        h('p', {}, T('先到「词库」新增或导入一些单词，这里就会开始安排复习。', 'Add or import words under “Words” and reviews will be scheduled here.')),
        h('a', { class: 'btn primary', href: `#/p/${pid}/words` }, T('去词库', 'Go to Words'))));
      return;
    }
    const e = pick(q.list);
    if (!e) {
      root.replaceChildren(h('div', { class: 'review-top' }, h('p', { class: 'status' }, T('今天的复习完成了', 'All done for today')), controls), tagRow || '',
        h('div', { class: 'empty' },
          h('h2', {}, T('今天的复习完成了', 'All done for today')),
          h('p', {}, q.nextDue ? T(`下一张卡会在 ${relLabel(q.nextDue - Date.now())}后到期。`, `The next card is due in ${relLabel(q.nextDue - Date.now())}.`) : T('目前没有到期的卡片。', 'Nothing is due right now.')),
          q.totalNew ? h('p', { class: 'muted' }, T(`还有 ${q.totalNew} 个新词会在之后几天加入。可以在设置中调整每日新词数。`, `${q.totalNew} new words will be introduced over the next days. Change the daily limit in Settings.`)) : null));
      return;
    }
    const isNew = !S.reviews.get(e.id)?.first_seen;
    const fieldMap = new Map(fieldsOf(table.id).map((f) => [f.key, f]));
    revealed = Math.min(revealed, fs.length - 1);

    const ttsField = fieldMap.get(S.project.settings.ttsField);
    const ttsText = ttsField && !isEmpty(e.data?.[ttsField.key]) ? String(e.data[ttsField.key]) : '';
    const card = h('div', { class: 'study-card' + (revealed < fs.length - 1 ? ' can-reveal' : ''), tabindex: '0', role: 'group', 'aria-label': T('闪卡', 'Flashcard') });
    card.append(h('div', { class: 'card-top' },
      h('span', {}, isNew ? T('新词', 'New') : T('复习', 'Review')),
      h('span', { class: 'face-count' }, `${revealed + 1} / ${fs.length}`),
      canSpeak && ttsText ? h('button', { class: 'speak', type: 'button', onClick: (ev) => { ev.stopPropagation(); speak(ttsText); } }, T('发音', 'Listen')) : h('span')));
    fs.slice(0, revealed + 1).forEach((keys, i) => {
      const face = h('div', { class: 'face' + (i === 0 ? ' prompt' : '') + (i === revealed && i > 0 ? ' fresh' : '') });
      let any = false;
      keys.forEach((k, j) => {
        const f = fieldMap.get(k); const v = e.data?.[k];
        if (!f || isEmpty(v)) return;
        any = true;
        if (i === 0) face.append(h('div', { class: j === 0 ? 'prompt-main' : 'prompt-sub', style: fontStyle(f), html: valueHTML(f, v) }));
        else face.append(h('div', { class: 'face-field' }, h('span', { class: 'face-label' }, f.label), h('div', { class: 'face-value', style: fontStyle(f), html: valueHTML(f, v) })));
      });
      if (!any) face.append(h('p', { class: 'muted' }, T('（这一面是空的）', '(This face is empty)')));
      card.append(face);
    });
    card.addEventListener('click', (ev) => { if (ev.target.closest('a,button')) return; reveal(); });

    let actions;
    if (revealed < fs.length - 1) {
      actions = h('div', { class: 'actions single' }, h('button', { class: 'btn primary big', onClick: reveal }, fs.length > 2 ? T(`显示第 ${revealed + 2} 面`, `Show face ${revealed + 2}`) : T('显示答案', 'Show answer')));
    } else {
      const old = S.reviews.get(e.id);
      actions = h('div', { class: 'actions' }, [[T('重来', 'Again'), 'again'], [T('困难', 'Hard'), 'hard'], [T('记得', 'Good'), 'good'], [T('简单', 'Easy'), 'easy']].map(([l, c], i) =>
        h('button', { class: 'rate rate-' + c, onClick: () => rate(i) }, h('b', {}, l), h('small', {}, schedule(old, i).label))));
    }
    root.replaceChildren(
      h('div', { class: 'review-top' }, h('p', { class: 'status' }, T(`待复习 ${q.dueCount} 张，新词 ${q.newCount} 张`, `${q.dueCount} due, ${q.newCount} new`)), controls),
      tagRow || '', card, actions,
      h('p', { class: 'keys' }, T('键盘：空格键翻面，1–4 评分', 'Keys: Space to reveal, 1–4 to rate')));
  }

  function reveal() { if (revealed < faces().length - 1) { revealed++; draw(); } }
  function rate(i) {
    const id = currentId; if (!id) return;
    const { rev } = schedule(S.reviews.get(id), i);
    lastRatedId = id; currentId = null; revealed = 0;
    saveReview(id, rev).catch((err) => toast(errMsg(err)));
    draw();
  }
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.overlay')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
      e.preventDefault(); reveal();
    } else if (['1', '2', '3', '4'].includes(e.key) && currentId && revealed >= faces().length - 1) { e.preventDefault(); rate(+e.key - 1); }
  }
  document.addEventListener('keydown', onKey);
  const off = onChange((ev) => { if (ev.kind !== 'review') draw(); });
  const timer = setInterval(() => { if (revealed === 0) draw(); }, 60000);
  draw();
  return () => { document.removeEventListener('keydown', onKey); off(); clearInterval(timer); };
}
