import type { Pack } from '../state/inventoryStore';
import type { Player } from '../state/sessionStore';
import type { ActiveChaosDraft, DraftPackRef } from '../types';

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
