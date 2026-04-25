import { describe, it, expect } from 'vitest';
import { sortColors, getArchetypeName, formatArchetype } from '../archetypes';

describe('sortColors', () => {
  it('sorts into WUBRG order', () => {
    expect(sortColors(['G', 'W', 'R'])).toEqual(['W', 'R', 'G']);
    expect(sortColors(['B', 'U', 'G', 'W', 'R'])).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  it('handles already-sorted input', () => {
    expect(sortColors(['W', 'U'])).toEqual(['W', 'U']);
  });

  it('returns empty array for empty input', () => {
    expect(sortColors([])).toEqual([]);
  });
});

describe('getArchetypeName', () => {
  it('returns empty string for no colors', () => {
    expect(getArchetypeName([])).toBe('');
  });

  it('returns mono-color names', () => {
    expect(getArchetypeName(['W'])).toBe('Mono-White');
    expect(getArchetypeName(['U'])).toBe('Mono-Blue');
    expect(getArchetypeName(['B'])).toBe('Mono-Black');
    expect(getArchetypeName(['R'])).toBe('Mono-Red');
    expect(getArchetypeName(['G'])).toBe('Mono-Green');
  });

  it('returns two-color guild names regardless of input order', () => {
    expect(getArchetypeName(['W', 'U'])).toBe('Azorius');
    expect(getArchetypeName(['R', 'W'])).toBe('Boros');
    expect(getArchetypeName(['U', 'W'])).toBe('Azorius');
    expect(getArchetypeName(['W', 'B'])).toBe('Orzhov');
    expect(getArchetypeName(['W', 'G'])).toBe('Selesnya');
    expect(getArchetypeName(['U', 'B'])).toBe('Dimir');
    expect(getArchetypeName(['U', 'R'])).toBe('Izzet');
    expect(getArchetypeName(['U', 'G'])).toBe('Simic');
    expect(getArchetypeName(['B', 'R'])).toBe('Rakdos');
    expect(getArchetypeName(['B', 'G'])).toBe('Golgari');
    expect(getArchetypeName(['R', 'G'])).toBe('Gruul');
  });

  it('returns three-color shard/wedge names', () => {
    expect(getArchetypeName(['W', 'U', 'B'])).toBe('Esper');
    expect(getArchetypeName(['W', 'U', 'R'])).toBe('Jeskai');
    expect(getArchetypeName(['W', 'U', 'G'])).toBe('Bant');
    expect(getArchetypeName(['W', 'B', 'R'])).toBe('Mardu');
    expect(getArchetypeName(['W', 'B', 'G'])).toBe('Abzan');
    expect(getArchetypeName(['W', 'R', 'G'])).toBe('Naya');
    expect(getArchetypeName(['U', 'B', 'R'])).toBe('Grixis');
    expect(getArchetypeName(['U', 'B', 'G'])).toBe('Sultai');
    expect(getArchetypeName(['U', 'R', 'G'])).toBe('Temur');
    expect(getArchetypeName(['B', 'R', 'G'])).toBe('Jund');
  });

  it('returns four-color names', () => {
    expect(getArchetypeName(['W', 'U', 'B', 'R'])).toBe('Yore-Tiller');
    expect(getArchetypeName(['U', 'B', 'R', 'G'])).toBe('Glint-Eye');
    expect(getArchetypeName(['W', 'B', 'R', 'G'])).toBe('Dune-Brood');
    expect(getArchetypeName(['W', 'U', 'R', 'G'])).toBe('Ink-Treader');
    expect(getArchetypeName(['W', 'U', 'B', 'G'])).toBe('Witch-Maw');
  });

  it('returns WUBRG for five-color', () => {
    expect(getArchetypeName(['W', 'U', 'B', 'R', 'G'])).toBe('WUBRG');
  });
});

describe('formatArchetype', () => {
  it('returns empty string when primary is empty', () => {
    expect(formatArchetype([], [])).toBe('');
    expect(formatArchetype([], ['B'])).toBe('');
  });

  it('returns just the name when no splash', () => {
    expect(formatArchetype(['W', 'R'], [])).toBe('Boros');
    expect(formatArchetype(['B', 'R', 'G'], [])).toBe('Jund');
  });

  it('appends a single splash color', () => {
    expect(formatArchetype(['W', 'U'], ['B'])).toBe('Azorius +B');
  });

  it('appends multiple splash colors in WUBRG order', () => {
    expect(formatArchetype(['B', 'R', 'G'], ['W', 'U'])).toBe('Jund +W +U');
    expect(formatArchetype(['B', 'R', 'G'], ['U', 'W'])).toBe('Jund +W +U');
  });

  it('handles unsorted primary input', () => {
    expect(formatArchetype(['U', 'W'], ['B'])).toBe('Azorius +B');
    expect(formatArchetype(['G', 'B', 'R'], [])).toBe('Jund');
  });
});
