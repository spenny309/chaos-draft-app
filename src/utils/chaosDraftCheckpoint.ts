import type { Pack } from '../state/inventoryStore';
import type { Player } from '../state/sessionStore';
import type { ActiveChaosDraft, DraftPackRef, DraftPlayer, DraftTournament } from '../types';

export interface ChaosDraftSessionView {
  players: Player[];
  packsSelectedOrder: Pack[];
  tempInventory: Pack[];
  nextPlayerIndex: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    Number.isInteger(value.seconds) &&
    Number.isInteger(value.nanoseconds) &&
    (value.nanoseconds as number) >= 0 &&
    (value.nanoseconds as number) < 1_000_000_000 &&
    typeof value.toMillis === 'function'
  );
}

function isValidPlayer(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    (value.userId === null || isNonEmptyString(value.userId))
  );
}

function isValidPackRef(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.imageUrl === 'string'
  );
}

function isValidInventoryPack(value: unknown): value is Pack {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.ownerId) &&
    isNonEmptyString(value.catalogId) &&
    isNonEmptyString(value.name) &&
    typeof value.imageUrl === 'string' &&
    Number.isInteger(value.inPerson) &&
    (value.inPerson as number) >= 0 &&
    Number.isInteger(value.inTransit) &&
    (value.inTransit as number) >= 0
  );
}

function sameMembers(actual: Set<string>, expected: Set<string>): boolean {
  return actual.size === expected.size && [...actual].every((id) => expected.has(id));
}

function validatePairingResult(value: unknown): void {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.player1Wins) || (value.player1Wins as number) < 0 ||
    !Number.isInteger(value.player2Wins) || (value.player2Wins as number) < 0 ||
    !Number.isInteger(value.ties) || (value.ties as number) < 0 ||
    !['player1', 'player2', 'tie'].includes(value.matchWinner as string) ||
    typeof value.isPartial !== 'boolean' ||
    !isNonEmptyString(value.submittedBy) ||
    !isTimestamp(value.submittedAt)
  ) {
    throw new Error('Tournament pairing result is invalid.');
  }
}

export function validateTournamentForPlayers(
  value: unknown,
  players: DraftPlayer[],
): asserts value is DraftTournament {
  if (
    !isRecord(value) ||
    value.status !== 'active' ||
    value.currentRound !== 1 ||
    !Number.isInteger(value.totalRounds) ||
    (value.totalRounds as number) <= 0 ||
    !Array.isArray(value.rounds)
  ) {
    throw new Error('Tournament Round 1 is invalid.');
  }

  for (const round of value.rounds) {
    if (
      !isRecord(round) ||
      !Number.isInteger(round.roundNumber) ||
      (round.roundNumber as number) <= 0 ||
      !['active', 'complete'].includes(round.status as string) ||
      !Array.isArray(round.pairings)
    ) {
      throw new Error('Tournament round data is invalid.');
    }
    for (const pairing of round.pairings) {
      if (
        !isRecord(pairing) ||
        !isNonEmptyString(pairing.id) ||
        !isNonEmptyString(pairing.player1Id) ||
        (pairing.player2Id !== null && !isNonEmptyString(pairing.player2Id)) ||
        !['pending', 'complete'].includes(pairing.status as string)
      ) {
        throw new Error('Tournament pairing data is invalid.');
      }
      if (pairing.result !== undefined) validatePairingResult(pairing.result);
    }
  }

  if (!Array.isArray(value.seats)) throw new Error('Tournament seats are invalid.');
  for (const seat of value.seats) {
    if (
      !isRecord(seat) ||
      !isNonEmptyString(seat.playerId) ||
      !Number.isInteger(seat.seat) ||
      (seat.seat as number) <= 0
    ) {
      throw new Error('Tournament seat data is invalid.');
    }
  }

  const roundOne = value.rounds.find(
    (round) => isRecord(round) && round.roundNumber === 1,
  ) as Record<string, unknown> | undefined;
  if (!roundOne || roundOne.status !== 'active') {
    throw new Error('Tournament Round 1 is not active.');
  }

  const expectedPlayers = new Set(players.map((player) => player.id));
  const pairedPlayers = new Set<string>();
  let byePlayerId: string | null = null;
  for (const pairingValue of roundOne.pairings as unknown[]) {
    const pairing = pairingValue as Record<string, unknown>;
    const player1Id = pairing.player1Id as string;
    if (!expectedPlayers.has(player1Id) || pairedPlayers.has(player1Id)) {
      throw new Error('Tournament players do not match checkpoint players.');
    }
    pairedPlayers.add(player1Id);

    if (pairing.player2Id === null) {
      if (byePlayerId !== null) {
        throw new Error('Tournament players do not match checkpoint players.');
      }
      byePlayerId = player1Id;
    } else {
      const player2Id = pairing.player2Id as string;
      if (!expectedPlayers.has(player2Id) || pairedPlayers.has(player2Id)) {
        throw new Error('Tournament players do not match checkpoint players.');
      }
      pairedPlayers.add(player2Id);
    }
  }

  const expectedByeCount = players.length % 2;
  if (
    !sameMembers(pairedPlayers, expectedPlayers) ||
    (roundOne.pairings as unknown[]).length !== Math.ceil(players.length / 2) ||
    Number(byePlayerId !== null) !== expectedByeCount
  ) {
    throw new Error('Tournament players do not match checkpoint players.');
  }

  const expectedSeatsWithoutBye = new Set(expectedPlayers);
  if (byePlayerId) expectedSeatsWithoutBye.delete(byePlayerId);
  const seatPlayers = new Set<string>();
  const seatNumbers = new Set<number>();
  for (const seatValue of value.seats) {
    const seat = seatValue as Record<string, unknown>;
    const playerId = seat.playerId as string;
    const seatNumber = seat.seat as number;
    if (
      !expectedPlayers.has(playerId) ||
      seatPlayers.has(playerId) ||
      seatNumbers.has(seatNumber)
    ) {
      throw new Error('Tournament seats do not match checkpoint players.');
    }
    seatPlayers.add(playerId);
    seatNumbers.add(seatNumber);
  }
  if (
    !sameMembers(seatPlayers, expectedPlayers) &&
    !sameMembers(seatPlayers, expectedSeatsWithoutBye)
  ) {
    throw new Error('Tournament seats do not match checkpoint players.');
  }
}

export function countSelectedPacks(packs: DraftPackRef[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pack of packs) counts.set(pack.id, (counts.get(pack.id) ?? 0) + 1);
  return counts;
}

export function validateCheckpointShape(checkpoint: ActiveChaosDraft, ownerId: string): void {
  if (!isRecord(checkpoint)) throw new Error('Checkpoint data is invalid.');
  if (!isNonEmptyString(checkpoint.ownerId)) throw new Error('Checkpoint owner is invalid.');
  if (checkpoint.ownerId !== ownerId) {
    throw new Error('Checkpoint owner does not match the signed-in admin.');
  }
  if (!isNonEmptyString(checkpoint.sessionId) || !isNonEmptyString(checkpoint.finalDraftId)) {
    throw new Error('Checkpoint identity is incomplete.');
  }
  if (!Number.isInteger(checkpoint.revision) || checkpoint.revision < 0) {
    throw new Error('Checkpoint revision is invalid.');
  }
  if (!Number.isInteger(checkpoint.numPacks) || checkpoint.numPacks <= 0) {
    throw new Error('Checkpoint numPacks is invalid.');
  }
  if (!Array.isArray(checkpoint.players) || checkpoint.players.length < 2) {
    throw new Error('Checkpoint player list is invalid.');
  }
  if (checkpoint.players.some((player) => !isValidPlayer(player))) {
    throw new Error('Checkpoint player data is invalid.');
  }
  if (new Set(checkpoint.players.map((player) => player.id)).size !== checkpoint.players.length) {
    throw new Error('Checkpoint player data contains duplicate IDs.');
  }
  if (!Array.isArray(checkpoint.packsSelectedOrder)) {
    throw new Error('Checkpoint selection data is invalid.');
  }
  if (checkpoint.packsSelectedOrder.some((pack) => !isValidPackRef(pack))) {
    throw new Error('Checkpoint selection data is invalid.');
  }
  if (checkpoint.packsSelectedOrder.length > checkpoint.numPacks) {
    throw new Error('Checkpoint selection exceeds numPacks.');
  }
  if (checkpoint.pendingTournament !== undefined) {
    validateTournamentForPlayers(checkpoint.pendingTournament, checkpoint.players);
  }
  if (!isTimestamp(checkpoint.createdAt) || !isTimestamp(checkpoint.updatedAt)) {
    throw new Error('Checkpoint timestamp data is invalid.');
  }
}

export function reconstructChaosSession(
  checkpoint: ActiveChaosDraft,
  inventory: Pack[],
  ownerId: string,
): ChaosDraftSessionView {
  validateCheckpointShape(checkpoint, ownerId);
  if (!Array.isArray(inventory)) throw new Error('Live inventory data is invalid.');

  const byId = new Map(inventory.map((pack) => [pack.id, pack]));
  const counts = countSelectedPacks(checkpoint.packsSelectedOrder);

  for (const [packId, selectedCount] of counts) {
    const livePack = byId.get(packId);
    if (!livePack) throw new Error(`Selected pack ${packId} is missing from inventory.`);
    if (!isValidInventoryPack(livePack)) {
      throw new Error(`Selected pack ${packId} has invalid inventory data.`);
    }
    if (livePack.ownerId !== ownerId) {
      throw new Error(`Selected pack ${packId} has the wrong owner.`);
    }
    if (livePack.inPerson < selectedCount) {
      throw new Error(`Selected pack ${packId} has insufficient quantity.`);
    }
  }

  const selected = checkpoint.packsSelectedOrder.map((ref) => ({ ...byId.get(ref.id)!, ...ref }));
  const players: Player[] = checkpoint.players.map((player, playerIndex) => ({
    ...player,
    selectedPacks: selected.filter(
      (_pack, selectionIndex) => selectionIndex % checkpoint.players.length === playerIndex,
    ),
  }));
  const tempInventory = inventory
    .map((pack) => ({ ...pack, inPerson: pack.inPerson - (counts.get(pack.id) ?? 0) }))
    .filter((pack) => pack.inPerson > 0 || pack.inTransit > 0);

  return {
    players,
    packsSelectedOrder: selected,
    tempInventory,
    nextPlayerIndex: selected.length % players.length,
  };
}
