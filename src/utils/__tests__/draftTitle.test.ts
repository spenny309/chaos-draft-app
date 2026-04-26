import { describe, it, expect } from 'vitest';
import { draftTitle } from '../draftTitle';
import type { Draft } from '../../types';

const fakeTs = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as any;

function fakeDraft(overrides: Partial<Draft>): Draft {
  return {
    id: 'x',
    type: 'regular',
    createdBy: 'u1',
    createdAt: fakeTs,
    status: 'finalized',
    players: [],
    ...overrides,
  };
}

describe('draftTitle — cube drafts', () => {
  it('cube + regular → "Vintage Cube Draft" (no type label)', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'regular' }))).toBe('Vintage Cube Draft');
  });

  it('cube + mobius → "Vintage Cube Mobius Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'mobius' }))).toBe('Vintage Cube Mobius Draft');
  });

  it('cube + sealed → "Vintage Cube Sealed Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'sealed' }))).toBe('Vintage Cube Sealed Draft');
  });

  it('cube + team-sealed → "Vintage Cube Team-Sealed Draft"', () => {
    expect(draftTitle(fakeDraft({ cubeId: 'c1', cubeName: 'Vintage Cube', type: 'team-sealed' }))).toBe('Vintage Cube Team-Sealed Draft');
  });
});

describe('draftTitle — sets-based drafts', () => {
  it('single set regular strips filler words', () => {
    expect(draftTitle(fakeDraft({
      type: 'regular',
      sets: [{ catalogId: 's1', name: 'Strixhaven: School of Mages Draft Booster', imageUrl: '', totalNeeded: 12 }],
    }))).toBe('Strixhaven: School of Mages Draft');
  });

  it('single set mobius appends type label', () => {
    expect(draftTitle(fakeDraft({
      type: 'mobius',
      sets: [{ catalogId: 's1', name: 'Strixhaven: School of Mages Draft Booster', imageUrl: '', totalNeeded: 24 }],
    }))).toBe('Strixhaven: School of Mages Mobius Draft');
  });

  it('multiple sets regular → "Regular Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'regular',
      sets: [
        { catalogId: 's1', name: 'Dominaria United', imageUrl: '', totalNeeded: 6 },
        { catalogId: 's2', name: 'The Brothers\' War', imageUrl: '', totalNeeded: 6 },
      ],
    }))).toBe('Regular Draft');
  });

  it('multiple sets mobius → "Mobius Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'mobius',
      sets: [
        { catalogId: 's1', name: 'Dominaria United', imageUrl: '', totalNeeded: 12 },
        { catalogId: 's2', name: 'The Brothers\' War', imageUrl: '', totalNeeded: 12 },
      ],
    }))).toBe('Mobius Draft');
  });
});

describe('draftTitle — chaos drafts', () => {
  it('chaos with one unique pack → strips filler and appends Draft', () => {
    expect(draftTitle(fakeDraft({
      type: 'chaos',
      packsSelectedOrder: [
        { id: 'p1', name: 'Strixhaven Draft Booster', imageUrl: '' },
        { id: 'p2', name: 'Strixhaven Draft Booster', imageUrl: '' },
      ],
    }))).toBe('Strixhaven Draft');
  });

  it('chaos with multiple unique packs → "Chaos Draft"', () => {
    expect(draftTitle(fakeDraft({
      type: 'chaos',
      packsSelectedOrder: [
        { id: 'p1', name: 'Dominaria United Draft Booster', imageUrl: '' },
        { id: 'p2', name: 'Strixhaven Draft Booster', imageUrl: '' },
      ],
    }))).toBe('Chaos Draft');
  });
});
