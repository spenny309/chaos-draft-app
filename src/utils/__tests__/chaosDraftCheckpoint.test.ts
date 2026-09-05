import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { Pack } from '../../state/inventoryStore';
import type { ActiveChaosDraft } from '../../types';
import {
  countSelectedPacks,
  reconstructChaosSession,
  validateCheckpointShape,
} from '../chaosDraftCheckpoint';

const inventory: Pack[] = [
  {
    id: 'a',
    ownerId: 'admin-1',
    catalogId: 'cat-a',
    name: 'Alpha',
    imageUrl: 'a.jpg',
    inPerson: 3,
    inTransit: 0,
  },
  {
    id: 'b',
    ownerId: 'admin-1',
    catalogId: 'cat-b',
    name: 'Beta',
    imageUrl: 'b.jpg',
    inPerson: 2,
    inTransit: 0,
  },
];

const checkpoint: ActiveChaosDraft = {
  ownerId: 'admin-1',
  sessionId: 'session-1',
  finalDraftId: 'draft-1',
  revision: 3,
  players: [
    { id: 'p1', name: 'Jieming', userId: null },
    { id: 'p2', name: 'Markus', userId: null },
  ],
  numPacks: 6,
  packsSelectedOrder: [
    { id: 'a', name: 'Alpha', imageUrl: 'a.jpg' },
    { id: 'b', name: 'Beta', imageUrl: 'b.jpg' },
    { id: 'a', name: 'Alpha', imageUrl: 'a.jpg' },
  ],
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(2),
};

describe('chaos checkpoint reconstruction', () => {
  it('counts repeats and assigns picks by position modulo player count', () => {
    expect(countSelectedPacks(checkpoint.packsSelectedOrder)).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );

    const view = reconstructChaosSession(checkpoint, inventory, 'admin-1');

    expect(view.players.map((player) => player.selectedPacks.map((pack) => pack.id))).toEqual([
      ['a', 'a'],
      ['b'],
    ]);
    expect(view.nextPlayerIndex).toBe(1);
    expect(view.tempInventory.map((pack) => [pack.id, pack.inPerson])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
    expect(inventory.map((pack) => pack.inPerson)).toEqual([3, 2]);
  });

  it.each([
    ['wrong owner', { ...checkpoint, ownerId: 'other' }, inventory, 'admin-1', /owner/i],
    [
      'missing pack',
      {
        ...checkpoint,
        packsSelectedOrder: [{ id: 'missing', name: 'Missing', imageUrl: 'x' }],
      },
      inventory,
      'admin-1',
      /missing/i,
    ],
    [
      'insufficient quantity',
      {
        ...checkpoint,
        packsSelectedOrder: Array(4).fill({ id: 'a', name: 'Alpha', imageUrl: 'a.jpg' }),
      },
      inventory,
      'admin-1',
      /quantity/i,
    ],
    ['too many selections', { ...checkpoint, numPacks: 2 }, inventory, 'admin-1', /numPacks/i],
  ])('%s is rejected', (_label, value, packs, ownerId, pattern) => {
    expect(() => reconstructChaosSession(value as ActiveChaosDraft, packs, ownerId)).toThrow(
      pattern as RegExp,
    );
  });
});

describe('chaos checkpoint validation', () => {
  it.each([
    ['non-object checkpoint', null, /checkpoint/i],
    ['empty owner', { ...checkpoint, ownerId: '' }, /owner/i],
    ['empty session ID', { ...checkpoint, sessionId: '' }, /identity/i],
    ['empty final draft ID', { ...checkpoint, finalDraftId: '' }, /identity/i],
    ['negative revision', { ...checkpoint, revision: -1 }, /revision/i],
    ['fractional revision', { ...checkpoint, revision: 1.5 }, /revision/i],
    ['invalid pack target', { ...checkpoint, numPacks: 0 }, /numPacks/i],
    ['non-array player list', { ...checkpoint, players: null }, /player/i],
    ['too few players', { ...checkpoint, players: checkpoint.players.slice(0, 1) }, /player/i],
    [
      'player with an empty ID',
      { ...checkpoint, players: [{ id: '', name: 'Jieming', userId: null }, checkpoint.players[1]] },
      /player/i,
    ],
    [
      'player with an invalid user ID',
      {
        ...checkpoint,
        players: [
          { id: 'p1', name: 'Jieming', userId: 42 },
          checkpoint.players[1],
        ],
      },
      /player/i,
    ],
    [
      'duplicate player IDs',
      {
        ...checkpoint,
        players: [checkpoint.players[0], { ...checkpoint.players[1], id: 'p1' }],
      },
      /player/i,
    ],
    ['non-array selections', { ...checkpoint, packsSelectedOrder: null }, /selection/i],
    [
      'selection with an empty ID',
      { ...checkpoint, packsSelectedOrder: [{ id: '', name: 'Alpha', imageUrl: 'a.jpg' }] },
      /selection/i,
    ],
    [
      'selection with malformed metadata',
      { ...checkpoint, packsSelectedOrder: [{ id: 'a', name: 42, imageUrl: 'a.jpg' }] },
      /selection/i,
    ],
    ['invalid creation timestamp', { ...checkpoint, createdAt: null }, /timestamp/i],
    ['invalid update timestamp', { ...checkpoint, updatedAt: {} }, /timestamp/i],
  ])('%s is rejected', (_label, value, pattern) => {
    expect(() => validateCheckpointShape(value as ActiveChaosDraft, 'admin-1')).toThrow(
      pattern as RegExp,
    );
  });

  it.each([
    ['non-array inventory', null, /inventory/i],
    [
      'wrong owner',
      inventory.map((pack) => (pack.id === 'a' ? { ...pack, ownerId: 'other' } : pack)),
      /owner/i,
    ],
    [
      'malformed quantity',
      inventory.map((pack) => (pack.id === 'a' ? { ...pack, inPerson: Number.NaN } : pack)),
      /inventory/i,
    ],
    [
      'negative quantity',
      inventory.map((pack) => (pack.id === 'a' ? { ...pack, inPerson: -1 } : pack)),
      /inventory/i,
    ],
    [
      'malformed metadata',
      inventory.map((pack) => (pack.id === 'a' ? { ...pack, catalogId: '' } : pack)),
      /inventory/i,
    ],
  ])('referenced inventory with %s is rejected', (_label, packs, pattern) => {
    expect(() =>
      reconstructChaosSession(checkpoint, packs as Pack[], 'admin-1'),
    ).toThrow(pattern as RegExp);
  });
});
