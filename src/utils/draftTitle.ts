import type { Draft } from '../types';

const FILLER = /\b(draft|play|booster|collector|set|pack)s?\b/gi;

function formatTypeLabel(type: string): string {
  if (type === 'regular') return '';
  if (type === 'team-sealed') return ' Team-Sealed';
  return ` ${type.charAt(0).toUpperCase() + type.slice(1)}`;
}

export function draftTitle(draft: Draft): string {
  if (draft.cubeId && draft.cubeName) {
    const typeLabel = formatTypeLabel(draft.type);
    return `${draft.cubeName}${typeLabel} Draft`;
  }

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
  if (setNames.length === 1) {
    const typeLabel = draft.type === 'chaos' ? '' : formatTypeLabel(draft.type);
    return `${setNames[0]}${typeLabel} Draft`;
  }
  const baseType = draft.type === 'regular' ? 'Regular' : draft.type === 'team-sealed' ? 'Team-Sealed' : draft.type.charAt(0).toUpperCase() + draft.type.slice(1);
  return `${baseType} Draft`;
}
