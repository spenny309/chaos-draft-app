import type { Draft } from '../types';

const FILLER = /\b(draft|play|booster|collector|set|pack)s?\b/gi;

export function draftTitle(draft: Draft): string {
  let rawNames: string[];
  if (draft.type === 'chaos') {
    const seen = new Set<string>();
    rawNames = [];
    for (const pack of draft.packsSelectedOrder ?? []) {
      if (!seen.has(pack.name)) { seen.add(pack.name); rawNames.push(pack.name); }
    }
  } else {
    rawNames = (draft.sets ?? []).map(s => s.name);
  }
  const setNames = rawNames.map(n => n.replace(FILLER, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const typeLabel = draft.type === 'regular'
    ? ''
    : ` ${draft.type.charAt(0).toUpperCase() + draft.type.slice(1)}`;
  if (setNames.length === 1) return `${setNames[0]}${typeLabel} Draft`;
  return `${draft.type === 'regular' ? 'Regular' : draft.type.charAt(0).toUpperCase() + draft.type.slice(1)} Draft`;
}
