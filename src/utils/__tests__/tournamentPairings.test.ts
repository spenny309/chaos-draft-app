import { describe, it, expect } from 'vitest';
import {
  shufflePlayers,
  generateRound1Pairings,
  playersToSeats,
} from '../tournamentPairings';
import type { DraftPlayer } from '../../types';

const makePlayer = (id: string): DraftPlayer => ({ id, name: id, userId: null });

describe('shufflePlayers', () => {
  it('returns all original players', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const shuffled = shufflePlayers(players);
    expect(shuffled).toHaveLength(4);
    expect(shuffled.map(p => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the original array', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const original = [...players];
    shufflePlayers(players);
    expect(players).toEqual(original);
  });
});

describe('generateRound1Pairings', () => {
  it('pairs seat 1 vs seat N/2+1 for even count', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(2);
    expect(pairings[0]).toMatchObject({ player1Id: 'a', player2Id: 'c', status: 'pending' });
    expect(pairings[1]).toMatchObject({ player1Id: 'b', player2Id: 'd', status: 'pending' });
  });

  it('generates correct pairings for 6 players (1v4, 2v5, 3v6)', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(3);
    expect(pairings[0]).toMatchObject({ player1Id: 'p1', player2Id: 'p4' });
    expect(pairings[1]).toMatchObject({ player1Id: 'p2', player2Id: 'p5' });
    expect(pairings[2]).toMatchObject({ player1Id: 'p3', player2Id: 'p6' });
  });

  it('handles 2 players', () => {
    const players = ['a', 'b'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toMatchObject({ player1Id: 'a', player2Id: 'b' });
  });

  it('gives the last player a bye for odd count', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    expect(pairings).toHaveLength(3);
    const bye = pairings.find(p => p.player2Id === null);
    expect(bye?.player1Id).toBe('e');
  });

  it('pairs correctly for odd count (first 4 pair normally)', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    const matches = pairings.filter(p => p.player2Id !== null);
    expect(matches[0]).toMatchObject({ player1Id: 'a', player2Id: 'c' });
    expect(matches[1]).toMatchObject({ player1Id: 'b', player2Id: 'd' });
  });

  it('all pairings have unique ids', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const pairings = generateRound1Pairings(players);
    const ids = pairings.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('playersToSeats', () => {
  it('assigns seats 1-N to all players for even count', () => {
    const players = ['a', 'b', 'c', 'd'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats).toHaveLength(4);
    expect(seats[0]).toEqual({ playerId: 'a', seat: 1 });
    expect(seats[3]).toEqual({ playerId: 'd', seat: 4 });
  });

  it('excludes the last player (bye holder) for odd count', () => {
    const players = ['a', 'b', 'c'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats).toHaveLength(2);
    expect(seats.find(s => s.playerId === 'c')).toBeUndefined();
  });

  it('seat numbers start at 1', () => {
    const players = ['a', 'b'].map(makePlayer);
    const seats = playersToSeats(players);
    expect(seats[0].seat).toBe(1);
    expect(seats[1].seat).toBe(2);
  });
});
