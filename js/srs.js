import { T } from './i18n.js';

export const DAY = 864e5, MIN = 6e4;
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function dayLabel(d) {
  if (d < 30) return T(`${d} 天`, `${d} d`);
  if (d < 365) { const m = Math.round(d / 30); return T(`${m} 个月`, `${m} mo`); }
  const y = (d / 365).toFixed(1).replace(/\.0$/, '');
  return T(`${y} 年`, `${y} y`);
}
export function relLabel(ms) {
  if (ms < MIN) return T('不到 1 分钟', '< 1 min');
  if (ms < 60 * MIN) { const m = Math.round(ms / MIN); return T(`${m} 分钟`, `${m} min`); }
  if (ms < DAY) { const hh = Math.round(ms / (60 * MIN)); return T(`${hh} 小时`, `${hh} h`); }
  return dayLabel(Math.round(ms / DAY));
}

/** 简化版 SM-2。r: 0 重来 / 1 困难 / 2 记得 / 3 简单 */
export function schedule(old, r) {
  const now = Date.now();
  const o = old || {};
  let reps = o.reps || 0, iv = o.interval_days || 0, ease = o.ease || 2.5;
  const lapses = o.lapses || 0;
  const base = { first_seen: o.first_seen || new Date(now).toISOString(), last_review: new Date(now).toISOString() };
  const mk = (due, extra) => ({ ...base, reps, interval_days: iv, ease, lapses, ...extra, due: new Date(due).toISOString() });
  if (r === 0) return { rev: mk(now + MIN, { reps: 0, interval_days: 0, ease: Math.max(1.3, ease - 0.2), lapses: lapses + (reps > 0 ? 1 : 0) }), label: relLabel(MIN) };
  if (r === 1 && reps === 0) return { rev: mk(now + 10 * MIN, { interval_days: 0 }), label: relLabel(10 * MIN) };
  let n;
  if (r === 1) { n = Math.max(iv + 1, Math.round(iv * 1.2)); ease = Math.max(1.3, ease - 0.15); }
  else if (r === 2) { n = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(iv + 1, Math.round(iv * ease)); }
  else { n = reps === 0 ? 4 : Math.max(iv + 2, Math.round(iv * ease * 1.3)); ease += 0.15; }
  return { rev: mk(startOfDay(now) + n * DAY, { reps: reps + 1, interval_days: n, ease: Math.round(ease * 100) / 100 }), label: dayLabel(n) };
}
