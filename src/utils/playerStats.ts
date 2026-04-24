import type { Draft, DraftType } from '../types';

export interface PlayerAggregate {
  displayName: string;
  normalizedName: string;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
  gameLosses: number;
  tournamentsPlayed: number;
  matchWinRate: number;
}

export interface HeadToHeadMatch {
  draftId: string;
  result: 'aWin' | 'bWin' | 'tie';
  aGames: number;
  bGames: number;
}

export interface HeadToHeadRecord {
  nameA: string;
  nameB: string;
  aWins: number;
  bWins: number;
  ties: number;
  matches: HeadToHeadMatch[];
}

export interface PlayerDraftResult {
  draftId: string;
  draftType: DraftType;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  gameWins: number;
  gameLosses: number;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

export function computePlayerAggregates(drafts: Draft[]): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate>();

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const playerById = new Map(draft.players.map(p => [p.id, p]));

    for (const player of draft.players) {
      const key = norm(player.name);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          displayName: player.name.trim(),
          normalizedName: key,
          matchWins: 0, matchLosses: 0, matchTies: 0,
          gameWins: 0, gameLosses: 0,
          tournamentsPlayed: 0,
          matchWinRate: 0,
        });
      }
      map.get(key)!.tournamentsPlayed++;
    }

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        const p1 = playerById.get(pairing.player1Id);
        const p2 = playerById.get(pairing.player2Id);
        if (!p1 || !p2) continue;
        const s1 = map.get(norm(p1.name));
        const s2 = map.get(norm(p2.name));
        if (!s1 || !s2) continue;

        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        s1.gameWins += player1Wins;
        s1.gameLosses += player2Wins;
        s2.gameWins += player2Wins;
        s2.gameLosses += player1Wins;

        if (matchWinner === 'player1') { s1.matchWins++; s2.matchLosses++; }
        else if (matchWinner === 'player2') { s2.matchWins++; s1.matchLosses++; }
        else { s1.matchTies++; s2.matchTies++; }
      }
    }
  }

  for (const agg of map.values()) {
    const total = agg.matchWins + agg.matchLosses + agg.matchTies;
    agg.matchWinRate = total > 0 ? agg.matchWins / total : 0;
  }

  return [...map.values()].sort((a, b) =>
    b.matchWins !== a.matchWins
      ? b.matchWins - a.matchWins
      : b.matchWinRate - a.matchWinRate
  );
}

export function computeHeadToHead(nameA: string, nameB: string, drafts: Draft[]): HeadToHeadRecord {
  const kA = norm(nameA);
  const kB = norm(nameB);
  const record: HeadToHeadRecord = { nameA, nameB, aWins: 0, bWins: 0, ties: 0, matches: [] };

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const playerById = new Map(draft.players.map(p => [p.id, p]));

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        const p1 = playerById.get(pairing.player1Id);
        const p2 = playerById.get(pairing.player2Id);
        if (!p1 || !p2) continue;

        const k1 = norm(p1.name);
        const k2 = norm(p2.name);
        let aIsP1: boolean;
        if (k1 === kA && k2 === kB) aIsP1 = true;
        else if (k1 === kB && k2 === kA) aIsP1 = false;
        else continue;

        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        const aGames = aIsP1 ? player1Wins : player2Wins;
        const bGames = aIsP1 ? player2Wins : player1Wins;

        let result: 'aWin' | 'bWin' | 'tie';
        if (matchWinner === 'tie') result = 'tie';
        else if ((matchWinner === 'player1') === aIsP1) result = 'aWin';
        else result = 'bWin';

        if (result === 'aWin') record.aWins++;
        else if (result === 'bWin') record.bWins++;
        else record.ties++;

        record.matches.push({ draftId: draft.id, result, aGames, bGames });
      }
    }
  }

  return record;
}

export function computePlayerDraftHistory(name: string, drafts: Draft[]): PlayerDraftResult[] {
  const key = norm(name);
  const results: PlayerDraftResult[] = [];

  for (const draft of drafts) {
    if (!draft.tournament) continue;
    const player = draft.players.find(p => norm(p.name) === key);
    if (!player) continue;

    const result: PlayerDraftResult = {
      draftId: draft.id,
      draftType: draft.type,
      matchWins: 0, matchLosses: 0, matchTies: 0,
      gameWins: 0, gameLosses: 0,
    };

    for (const round of draft.tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.player2Id === null || !pairing.result) continue;
        if (pairing.player1Id !== player.id && pairing.player2Id !== player.id) continue;

        const isP1 = pairing.player1Id === player.id;
        const { matchWinner, player1Wins, player2Wins } = pairing.result;
        result.gameWins += isP1 ? player1Wins : player2Wins;
        result.gameLosses += isP1 ? player2Wins : player1Wins;

        if (matchWinner === 'player1') { if (isP1) result.matchWins++; else result.matchLosses++; }
        else if (matchWinner === 'player2') { if (!isP1) result.matchWins++; else result.matchLosses++; }
        else result.matchTies++;
      }
    }

    results.push(result);
  }

  return results;
}
