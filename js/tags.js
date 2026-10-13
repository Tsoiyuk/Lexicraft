import { h } from './ui.js';

// 预设色票：[浅色模式, 深色模式]
export const PALETTE = {
  red: ['#C23B2C', '#EE7D70'], orange: ['#C1661A', '#F0A15E'], amber: ['#9A720C', '#E2B947'],
  green: ['#2C7A47', '#6DC48D'], teal: ['#14767A', '#56C3C2'], blue: ['#2360A3', '#76ACEB'],
  indigo: ['#4549AA', '#979CEC'], violet: ['#7642A3', '#BD91E6'], pink: ['#AD3774', '#E981B9'],
  brown: ['#7A573A', '#C49C77'], slate: ['#4B586B', '#9AA7BB'], gray: ['#686C73', '#A6AAB1'],
};
export const COLOR_KEYS = Object.keys(PALETTE);
export const nextColor = (n) => COLOR_KEYS[n % COLOR_KEYS.length];

export function tagStyle(color) {
  const [l, d] = PALETTE[color] || PALETTE.gray;
  return { '--tc-l': l, '--tc-d': d };
}

export function tagChip(tag, { active = false, onClick, small = false } = {}) {
  const props = { class: 'tag' + (active ? ' active' : '') + (small ? ' small' : ''), style: tagStyle(tag.color) };
  if (onClick) return h('button', { ...props, type: 'button', 'aria-pressed': String(active), onClick }, tag.name);
  return h('span', props, tag.name);
}
