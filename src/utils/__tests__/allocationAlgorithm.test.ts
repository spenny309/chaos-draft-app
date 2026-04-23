import { describe, it, expect } from 'vitest';
import {
  allocateFromPool,
  distributePacksAcrossSets,
  allocateRegularDraft,
} from '../allocationAlgorithm';

describe('allocateFromPool', () => {
  it('allocates evenly when contributors have equal stock', () => {
    const pool = [
      { userId: 'ben', userName: 'Ben', available: 6 },
      { userId: 'markus', userName: 'Markus', available: 6 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 12);
    expect(shortfall).toBe(0);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'markus')?.count).toBe(6);
  });

  it('uses more from contributors with larger stock after equalising smaller ones', () => {
    const pool = [
      { userId: 'ben', userName: 'Ben', available: 6 },
      { userId: 'markus', userName: 'Markus', available: 6 },
      { userId: 'spencer', userName: 'Spencer', available: 12 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 24);
    expect(shortfall).toBe(0);
    const total = contributions.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(24);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'markus')?.count).toBe(6);
    expect(contributions.find(c => c.userId === 'spencer')?.count).toBe(12);
  });

  it('reports shortfall when pool is insufficient', () => {
    const pool = [{ userId: 'ben', userName: 'Ben', available: 6 }];
    const { contributions, shortfall } = allocateFromPool(pool, 10);
    expect(shortfall).toBe(4);
    expect(contributions.find(c => c.userId === 'ben')?.count).toBe(6);
  });

  it('returns no contributions when needed is 0', () => {
    const { contributions, shortfall } = allocateFromPool(
      [{ userId: 'ben', userName: 'Ben', available: 6 }],
      0
    );
    expect(contributions).toHaveLength(0);
    expect(shortfall).toBe(0);
  });

  it('handles empty pool', () => {
    const { contributions, shortfall } = allocateFromPool([], 10);
    expect(contributions).toHaveLength(0);
    expect(shortfall).toBe(10);
  });

  it('never exceeds needed even when pool has surplus', () => {
    const pool = [
      { userId: 'a', userName: 'A', available: 10 },
      { userId: 'b', userName: 'B', available: 10 },
    ];
    const { contributions, shortfall } = allocateFromPool(pool, 7);
    expect(shortfall).toBe(0);
    const total = contributions.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(7);
  });
});

describe('distributePacksAcrossSets', () => {
  it('distributes evenly when divisible', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(12, 3);
    expect(counts).toEqual([4, 4, 4]);
    expect(wasRounded).toBe(false);
  });

  it('uses largest-remainder method and sums exactly to total', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(12, 5);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(12);
    expect(wasRounded).toBe(true);
    const sorted = [...counts].sort((a, b) => b - a);
    expect(sorted).toEqual([3, 3, 2, 2, 2]);
  });

  it('handles single set', () => {
    const { counts, wasRounded } = distributePacksAcrossSets(24, 1);
    expect(counts).toEqual([24]);
    expect(wasRounded).toBe(false);
  });

  it('handles zero sets', () => {
    const { counts } = distributePacksAcrossSets(24, 0);
    expect(counts).toEqual([]);
  });
});

describe('allocateRegularDraft', () => {
  it('uses participants before non-participants', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [
        { userId: 'ben', userName: 'Ben', available: 6 },
        { userId: 'markus', userName: 'Markus', available: 6 },
        { userId: 'spencer', userName: 'Spencer', available: 12 },
      ],
      nonParticipants: [{ userId: 'elijah', userName: 'Elijah', available: 6 }],
    }]);
    const set = result[0];
    expect(set.shortfall).toBe(0);
    expect(set.contributions.find(c => c.userId === 'elijah')).toBeUndefined();
    expect(set.contributions.reduce((s, c) => s + c.count, 0)).toBe(24);
  });

  it('falls back to non-participants when participants are insufficient', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [
        { userId: 'ben', userName: 'Ben', available: 6 },
        { userId: 'markus', userName: 'Markus', available: 6 },
      ],
      nonParticipants: [{ userId: 'elijah', userName: 'Elijah', available: 12 }],
    }]);
    const set = result[0];
    expect(set.shortfall).toBe(0);
    expect(set.contributions.find(c => c.userId === 'elijah')?.count).toBe(12);
    expect(set.contributions.reduce((s, c) => s + c.count, 0)).toBe(24);
  });

  it('reports shortfall when all inventories are insufficient', () => {
    const result = allocateRegularDraft([{
      catalogId: 'avatar',
      name: 'Avatar',
      totalNeeded: 24,
      participants: [{ userId: 'ben', userName: 'Ben', available: 6 }],
      nonParticipants: [],
    }]);
    expect(result[0].shortfall).toBe(18);
  });

  it('handles multiple sets independently', () => {
    const result = allocateRegularDraft([
      {
        catalogId: 'set-a', name: 'Set A', totalNeeded: 6,
        participants: [{ userId: 'ben', userName: 'Ben', available: 6 }],
        nonParticipants: [],
      },
      {
        catalogId: 'set-b', name: 'Set B', totalNeeded: 6,
        participants: [{ userId: 'markus', userName: 'Markus', available: 6 }],
        nonParticipants: [],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].shortfall).toBe(0);
    expect(result[1].shortfall).toBe(0);
  });
});
