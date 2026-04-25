import type { MtgColor } from '../types';

const COLOR_ORDER: MtgColor[] = ['W', 'U', 'B', 'R', 'G'];

const ARCHETYPE_NAMES: Record<string, string> = {
  W: 'Mono-White',
  U: 'Mono-Blue',
  B: 'Mono-Black',
  R: 'Mono-Red',
  G: 'Mono-Green',
  WU: 'Azorius',
  WB: 'Orzhov',
  WR: 'Boros',
  WG: 'Selesnya',
  UB: 'Dimir',
  UR: 'Izzet',
  UG: 'Simic',
  BR: 'Rakdos',
  BG: 'Golgari',
  RG: 'Gruul',
  WUB: 'Esper',
  WUR: 'Jeskai',
  WUG: 'Bant',
  WBR: 'Mardu',
  WBG: 'Abzan',
  WRG: 'Naya',
  UBR: 'Grixis',
  UBG: 'Sultai',
  URG: 'Temur',
  BRG: 'Jund',
  WUBR: 'Yore-Tiller',
  UBRG: 'Glint-Eye',
  WBRG: 'Dune-Brood',
  WURG: 'Ink-Treader',
  WUBG: 'Witch-Maw',
  WUBRG: 'WUBRG',
};

export function sortColors(colors: MtgColor[]): MtgColor[] {
  return [...colors].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
}

export function getArchetypeName(primary: MtgColor[]): string {
  if (primary.length === 0) return '';
  const key = sortColors(primary).join('');
  return ARCHETYPE_NAMES[key] ?? key;
}

export function formatArchetype(primary: MtgColor[], splash: MtgColor[]): string {
  const name = getArchetypeName(primary);
  if (!name) return '';
  if (splash.length === 0) return name;
  const splashStr = sortColors(splash).map(c => `+${c}`).join(' ');
  return `${name} ${splashStr}`;
}
