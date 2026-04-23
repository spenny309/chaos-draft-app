import type { DraftPlayer, TournamentPairing, TournamentRound } from '../types';

export interface PlayerStanding {
  playerId: string;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
}

export function computeStandings(
  players: DraftPlayer[],
  completedRounds: TournamentRound[]
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>(
    players.map(p => [p.id, { playerId: p.id, matchWins: 0, matchLosses: 0, matchTies: 0, gameWins: 0 }])
  );

  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id === null || !pairing.result) continue;
      const { matchWinner, player1Wins, player2Wins } = pairing.result;
      const s1 = standings.get(pairing.player1Id)!;
      const s2 = standings.get(pairing.player2Id)!;
      s1.gameWins += player1Wins;
      s2.gameWins += player2Wins;
      if (matchWinner === 'player1') { s1.matchWins++; s2.matchLosses++; }
      else if (matchWinner === 'player2') { s2.matchWins++; s1.matchLosses++; }
      else { s1.matchTies++; s2.matchTies++; }
    }
  }

  return [...standings.values()];
}

export function generateSwissPairings(
  players: DraftPlayer[],
  completedRounds: TournamentRound[]
): TournamentPairing[] {
  const standings = computeStandings(players, completedRounds);

  const byeHistory = new Set<string>();
  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id === null) byeHistory.add(pairing.player1Id);
    }
  }

  const played = new Set<string>();
  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id !== null) {
        played.add(`${pairing.player1Id}:${pairing.player2Id}`);
        played.add(`${pairing.player2Id}:${pairing.player1Id}`);
      }
    }
  }

  const sorted = [...standings].sort(
    (a, b) => b.matchWins - a.matchWins || b.gameWins - a.gameWins
  );
  const unpaired = sorted.map(s => players.find(p => p.id === s.playerId)!);

  const pairings: TournamentPairing[] = [];
  let byePairing: TournamentPairing | undefined;

  if (unpaired.length % 2 === 1) {
    const eligible = unpaired.filter(p => !byeHistory.has(p.id));
    const byeReceiver = eligible.length > 0
      ? eligible[eligible.length - 1]
      : unpaired[unpaired.length - 1];
    unpaired.splice(unpaired.findIndex(p => p.id === byeReceiver.id), 1);
    byePairing = { id: crypto.randomUUID(), player1Id: byeReceiver.id, player2Id: null, status: 'pending' };
  }

  while (unpaired.length > 1) {
    const p1 = unpaired.shift()!;
    let found = false;
    for (let i = 0; i < unpaired.length; i++) {
      const p2 = unpaired[i];
      if (!played.has(`${p1.id}:${p2.id}`)) {
        pairings.push({ id: crypto.randomUUID(), player1Id: p1.id, player2Id: p2.id, status: 'pending' });
        unpaired.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) {
      const p2 = unpaired.shift()!;
      pairings.push({ id: crypto.randomUUID(), player1Id: p1.id, player2Id: p2.id, status: 'pending' });
    }
  }

  if (byePairing) pairings.push(byePairing);
  return pairings;
}
