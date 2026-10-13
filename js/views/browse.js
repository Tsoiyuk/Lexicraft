import { S, wordsTable, fieldsOf, entriesOf, onChange, placementOf } from '../store.js';
import { h, esc, norm } from '../ui.js';
import { T, locale } from '../i18n.js';
import { valueToText, valueHTML, fontStyle, isEmpty, linkHref } from '../render.js';
import { openEntryForm } from '../entryForm.js';
import { PALETTE } from '../tags.js';

export function renderBrowse(root, rest) {
  const pid = S.pid;
  const table = wordsTable();
  const selected = rest[0] != null ? rest[0].normalize('NFC') : null;
  const qKey = 'lc-bq-' + pid;
  let query = sessionStorage.getItem(qKey) || '';
  let groups = [];
  let F = {};

  const search = h('input', { type: 'search', class: 'search', value: query, placeholder: T('查词条、读音或释义', 'Search headwords, readings or meanings'), 'aria-label': T('搜索', 'Search') });
  search.addEventListener('input', () => { query = search.value; sessionStorage.setItem(qKey, query); drawList(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = listEl.querySelector('a'); if (a) location.hash = a.getAttribute('href'); } });
  const countEl = h('p', { class: 'index-count muted' });
  const listEl = h('nav', { class: 'index-list', 'aria-label': T('词条索引', 'Entry index') });
  const pageEl = h('article', { class: 'entry-page' });
  root.append(h('div', { class: 'browse' + (selected != null ? ' has-page' : '') },
    h('aside', { class: 'index' }, h('div', { class: 'index-tools' }, search, h('button', { class: 'btn primary small', onClick: () => openEntryForm({ tableId: table.id }) }, T('新增', 'New'))), countEl, listEl),
    pageEl));

  function build() {
    const fs = fieldsOf(table.id);
    const titleF = fs.find((f) => placementOf(f) === 'title') || fs[0];
    F = {
      all: fs, title: titleF,
      sub: fs.filter((f) => placementOf(f) === 'subtitle'),
      pos: fs.find((f) => placementOf(f) === 'pos'),
      shared: fs.filter((f) => placementOf(f) === 'shared'),
      sense: fs.filter((f) => placementOf(f) === 'sense' && f !== titleF),
      infobox: fs.filter((f) => placementOf(f) === 'infobox'),
    };
    const map = new Map();
    for (const e of entriesOf(table.id)) {
      const hw = String(e.data?.[titleF?.key] ?? '').trim().normalize('NFC');
      if (!hw) continue;
      let g = map.get(hw);
      if (!g) map.set(hw, (g = { hw, rows: [] }));
      g.rows.push(e);
    }
    for (const g of map.values()) {
      g.sub = [...new Set(g.rows.flatMap((r) => F.sub.map((f) => valueToText(f, r.data?.[f.key])).filter(Boolean)))].join(T('，', ', '));
      g.nhw = norm(g.hw);
      g.hay = norm(g.rows.map((r) => fs.map((f) => valueToText(f, r.data?.[f.key])).join(' ')).join(' '));
    }
    groups = [...map.values()].sort((a, b) => a.hw.localeCompare(b.hw, undefined, { sensitivity: 'base' }));
  }

  function drawList() {
    const nq = norm(query);
    let items = groups;
    if (nq) {
      items = groups.map((g) => [g, g.nhw === nq ? 0 : g.nhw.startsWith(nq) ? 1 : g.nhw.includes(nq) ? 2 : g.hay.includes(nq) ? 3 : 9])
        .filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1] || a[0].hw.localeCompare(b[0].hw)).map(([g]) => g);
    }
    countEl.textContent = nq ? T(`找到 ${items.length} 个`, `${items.length} found`) : T(`共 ${groups.length} 个词条`, `${groups.length} entries`);
    const shown = items.slice(0, 1000);
    listEl.replaceChildren(...shown.map((g) => h('a', { class: 'idx-item', href: linkHref(g.hw), 'aria-current': g.hw === selected ? 'page' : null },
      h('span', { class: 'idx-hw', style: fontStyle(F.title) }, g.hw), g.sub ? h('span', { class: 'idx-sub', style: fontStyle(F.sub[0]) }, g.sub) : null)),
      items.length > shown.length ? h('p', { class: 'hint pad' }, T('结果太多，请输入更多字词缩小范围。', 'Too many results. Type more to narrow down.')) : '');
    if (!items.length && nq) listEl.append(h('div', { class: 'pad' }, h('p', { class: 'hint' }, T('没有找到。', 'Nothing found.')),
      h('button', { class: 'btn ghost small', onClick: () => openEntryForm({ tableId: table.id, prefill: { [F.title.key]: query.trim() } }) }, T(`新建「${query.trim()}」`, `Create “${query.trim()}”`))));
  }

  function drawPage() {
    if (selected == null) {
      const total = entriesOf(table.id).length;
      const rnd = groups.length ? groups[Math.floor(Math.random() * groups.length)] : null;
      pageEl.replaceChildren(h('div', { class: 'welcome' },
        h('h1', { class: 'entry-title' }, S.project.name),
        h('p', { class: 'muted' }, S.project.language ? `${S.project.language}　` : '', T(`${groups.length} 个词条，${total} 行`, `${groups.length} headwords, ${total} rows`)),
        h('p', {}, T('在左侧搜索或点选词条。也可以在「表格」页面像 Excel 一样批量编辑。', 'Search or pick an entry on the left, or edit in bulk on the “Table” page.')),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onClick: () => openEntryForm({ tableId: table.id }) }, T('新增词条', 'New entry')),
          rnd ? h('a', { class: 'btn ghost', href: linkHref(rnd.hw) }, T('随便看一个', 'Random entry')) : null)));
      return;
    }
    const g = groups.find((x) => x.hw === selected) || groups.find((x) => x.nhw === norm(selected));
    const back = h('a', { class: 'page-back', href: `#/p/${pid}/browse` }, T('← 索引', '← Index'));
    if (!g) {
      pageEl.replaceChildren(back, h('div', { class: 'welcome' },
        h('h1', { class: 'entry-title', style: fontStyle(F.title) }, selected),
        h('p', { class: 'muted' }, T('这个词条还不存在。', 'This entry does not exist yet.')),
        h('button', { class: 'btn primary', onClick: () => openEntryForm({ tableId: table.id, prefill: { [F.title.key]: selected } }) }, T('创建这个词条', 'Create this entry'))));
      return;
    }
    const rows = g.rows;
    const updated = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at);
    const fmt = new Intl.DateTimeFormat(locale(), { dateStyle: 'full', timeStyle: 'short' });

    const first = (f) => { for (const r of rows) if (!isEmpty(r.data?.[f.key])) return r.data[f.key]; return null; };
    const uniq = (f) => { const seen = new Set(), out = []; for (const r of rows) { const v = r.data?.[f.key]; if (isEmpty(v)) continue; const k = JSON.stringify(v); if (!seen.has(k)) { seen.add(k); out.push(v); } } return out; };

    // 信息框
    const boxes = [];
    const kv = [];
    for (const f of F.infobox) {
      const v = first(f);
      if (isEmpty(v)) continue;
      if (f.type === 'char_breakdown' && Array.isArray(v)) {
        boxes.push(`<section class="infobox"><h3>${esc(f.label)}</h3><div class="cb-scroll"><table class="cb-table">
          <tr>${v.map((x) => `<td class="cb-c"><button type="button" data-char="${esc(x.c)}" style='${fontStyle(f)}'>${esc(x.c)}</button></td>`).join('')}</tr>
          <tr>${v.map((x) => `<td>${esc(x.r || '—')}</td>`).join('')}</tr>
          <tr>${v.map((x) => `<td class="cb-t">${esc(x.t || '')}</td>`).join('')}</tr></table></div></section>`);
      } else kv.push(`<tr><th>${esc(f.label)}</th><td style='${fontStyle(f)}'>${valueHTML(f, v)}</td></tr>`);
    }
    if (kv.length) boxes.push(`<section class="infobox"><table class="kv">${kv.join('')}</table></section>`);

    // 公共段落（同一分组合并）
    const shared = [];
    for (let i = 0; i < F.shared.length; i++) {
      const f = F.shared[i], grp = f.options?.group;
      if (grp) {
        const members = [f];
        while (F.shared[i + 1]?.options?.group === grp) members.push(F.shared[++i]);
        const lis = members.flatMap((m) => uniq(m).map((v) => `<li><span class="li-label">${esc(m.label)}</span> <span style='${fontStyle(m)}'>${valueHTML(m, v)}</span></li>`));
        if (lis.length) shared.push(`<section><h2>${esc(grp)}</h2><ul class="plain">${lis.join('')}</ul></section>`);
      } else {
        const vals = uniq(f);
        if (vals.length) shared.push(`<section><h2>${esc(f.label)}</h2>${vals.map((v) => `<div style='${fontStyle(f)}'>${f.type === 'long_text' ? valueHTML(f, v) : `<p>${valueHTML(f, v)}</p>`}</div>`).join('')}</section>`);
      }
    }

    // 各词性
    const senses = rows.map((r) => {
      const posText = F.pos ? valueToText(F.pos, r.data?.[F.pos.key]) : '';
      const parts = F.sense.map((f) => {
        const v = r.data?.[f.key];
        if (isEmpty(v)) return '';
        if (f.type === 'long_text') return `<div class="sense-block" style='${fontStyle(f)}'>${valueHTML(f, v, { numbered: true })}</div>`;
        return `<p class="kvline"><span class="li-label">${esc(f.label)}</span> <span style='${fontStyle(f)}'>${valueHTML(f, v)}</span></p>`;
      }).join('');
      const tags = S.tags.filter((t) => S.entryTags.get(r.id)?.has(t.id));
      return `<section class="sense"><div class="sense-head"><h2>${esc(posText || T('释义', 'Definition'))}</h2><button type="button" class="icon-btn edit" data-edit="${r.id}" title="${esc(T('编辑', 'Edit'))}" aria-label="${esc(T('编辑', 'Edit'))}">✎</button></div>${parts || `<p class="muted">${esc(T('（还没有内容）', '(No content yet)'))}</p>`}${tags.length ? `<p class="sense-tags">${tags.map((t) => `<span class="tag small" style="--tc-l:${(PALETTE[t.color] || PALETTE.gray)[0]};--tc-d:${(PALETTE[t.color] || PALETTE.gray)[1]}">${esc(t.name)}</span>`).join('')}</p>` : ''}</section>`;
    }).join('');

    pageEl.replaceChildren(back);
    pageEl.insertAdjacentHTML('beforeend', `
      <header class="entry-head">
        <h1 class="entry-title"><span style='${fontStyle(F.title)}'>${esc(g.hw)}</span>${g.sub ? ` <span class="entry-sub" style='${fontStyle(F.sub[0])}'>(${esc(g.sub)})</span>` : ''}</h1>
        <p class="entry-meta">${esc(T('最后修改：', 'Last edited: ') + fmt.format(new Date(updated)))}</p>
      </header>
      <div class="entry-body">
        ${boxes.length ? `<div class="infobox-col">${boxes.join('')}</div>` : ''}
        <div class="entry-main">${shared.join('')}${senses}</div>
      </div>`);
    pageEl.append(h('div', { class: 'entry-foot' },
      h('button', { class: 'btn ghost', onClick: () => openEntryForm({ tableId: table.id, prefill: { [F.title.key]: g.hw, ...Object.fromEntries(F.sub.map((f) => [f.key, rows[0].data?.[f.key]]).filter(([, v]) => !isEmpty(v))) } }) },
        F.pos ? T('为这个词添加另一个词性', 'Add another part of speech') : T('为这个词添加另一条', 'Add another row for this word'))));
  }

  pageEl.addEventListener('click', (ev) => {
    const ed = ev.target.closest('[data-edit]');
    if (ed) { const e = S.entries.get(ed.dataset.edit); if (e) openEntryForm({ entry: e }); return; }
    const ch = ev.target.closest('[data-char]');
    if (ch) { query = ch.dataset.char; search.value = query; sessionStorage.setItem(qKey, query); drawList(); root.querySelector('.browse')?.classList.remove('has-page'); search.focus(); }
  });

  build(); drawList(); drawPage();
  let raf = 0;
  const off = onChange((ev) => {
    if (!['entry', 'bulk', 'fields', 'tags', 'entryTags', 'project'].includes(ev.kind)) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { build(); drawList(); drawPage(); });
  });
  if (selected != null) setTimeout(() => listEl.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }), 0);
  return () => { off(); cancelAnimationFrame(raf); };
}
