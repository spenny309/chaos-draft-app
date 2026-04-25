import type { DraftPlayer, TournamentPairing, TournamentRound } from '../types';

export interface PlayerStanding {
  playerId: string;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
  gameLosses: number;
}

function headToHead(aId: string, bId: string, rounds: TournamentRound[]): number {
  for (const round of rounds) {
    for (const p of round.pairings) {
      if (p.player2Id === null || !p.result) continue;
      if (p.player1Id === aId && p.player2Id === bId) {
        if (p.result.matchWinner === 'player1') return -1;
        if (p.result.matchWinner === 'player2') return 1;
      }
      if (p.player1Id === bId && p.player2Id === aId) {
        if (p.result.matchWinner === 'player1') return 1;
        if (p.result.matchWinner === 'player2') return -1;
      }
    }
  }
  return 0;
}

export function computeStandings(
  players: DraftPlayer[],
  completedRounds: TournamentRound[]
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>(
    players.map(p => [p.id, { playerId: p.id, matchWins: 0, matchLosses: 0, matchTies: 0, gameWins: 0, gameLosses: 0 }])
  );

  for (const round of completedRounds) {
    for (const pairing of round.pairings) {
      if (pairing.player2Id === null || !pairing.result) continue;
      const { matchWinner, player1Wins, player2Wins } = pairing.result;
      const s1 = standings.get(pairing.player1Id);
      const s2 = standings.get(pairing.player2Id);
      if (!s1 || !s2) continue;
      s1.gameWins += player1Wins;
      s1.gameLosses += player2Wins;
      s2.gameWins += player2Wins;
      s2.gameLosses += player1Wins;
      if (matchWinner === 'player1') { s1.matchWins++; s2.matchLosses++; }
      else if (matchWinner === 'player2') { s2.matchWins++; s1.matchLosses++; }
      else { s1.matchTies++; s2.matchTies++; }
    }
  }

  return [...standings.values()].sort((a, b) => {
    if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins;
    const h2h = headToHead(a.playerId, b.playerId, completedRounds);
    if (h2h !== 0) return h2h;
    return a.gameLosses - b.gameLosses;
  });
}

function canPairWithoutRematch(playerIds: string[], played: Set<string>): boolean {
  if (playerIds.length === 0) return true;
  if (playerIds.length % 2 !== 0) return false;
  const [first, ...rest] = playerIds;
  for (let i = 0; i < rest.length; i++) {
    if (!played.has(`${first}:${rest[i]}`)) {
      const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
      if (canPairWithoutRematch(remaining, played)) return true;
    }
  }
  return false;
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
  const unpaired = sorted
    .map(s => players.find(p => p.id === s.playerId))
    .filter((p): p is DraftPlayer => p !== undefined);

  const pairings: TournamentPairing[] = [];
  let byePairing: TournamentPairing | undefined;

  if (unpaired.length % 2 === 1) {
    const eligible = unpaired.filter(p => !byeHistory.has(p.id));
    const candidates = eligible.length > 0 ? eligible : unpaired;
    // Default: lowest-ranked candidate. Try each from lowest to highest; pick the first
    // whose removal still allows the remaining players to be paired without rematches.
    let byeReceiver = candidates[candidates.length - 1];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      const remaining = unpaired.filter(p => p.id !== candidate.id).map(p => p.id);
      if (canPairWithoutRematch(remaining, played)) {
        byeReceiver = candidate;
        break;
      }
    }
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
