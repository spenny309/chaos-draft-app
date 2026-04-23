import type { DraftPlayer, DraftSeat, TournamentPairing } from '../types';

export function shufflePlayers(players: DraftPlayer[]): DraftPlayer[] {
  const result = [...players];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateRound1Pairings(orderedPlayers: DraftPlayer[]): TournamentPairing[] {
  const isOdd = orderedPlayers.length % 2 !== 0;
  const activePlayers = isOdd ? orderedPlayers.slice(0, -1) : orderedPlayers;
  const byePlayer = isOdd ? orderedPlayers[orderedPlayers.length - 1] : null;
  const half = activePlayers.length / 2;
  const pairings: TournamentPairing[] = [];

  for (let i = 0; i < half; i++) {
    pairings.push({
      id: crypto.randomUUID(),
      player1Id: activePlayers[i].id,
      player2Id: activePlayers[i + half].id,
      status: 'pending',
    });
  }

  if (byePlayer) {
    pairings.push({
      id: crypto.randomUUID(),
      player1Id: byePlayer.id,
      player2Id: null,
      status: 'pending',
    });
  }

  return pairings;
}

export function playersToSeats(orderedPlayers: DraftPlayer[]): DraftSeat[] {
  const isOdd = orderedPlayers.length % 2 !== 0;
  const activePlayers = isOdd ? orderedPlayers.slice(0, -1) : orderedPlayers;
  return activePlayers.map((p, i) => ({ playerId: p.id, seat: i + 1 }));
}
