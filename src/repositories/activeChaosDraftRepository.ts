import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  ActiveChaosDraft,
  CheckpointMutationResult,
  DraftPackRef,
  DraftPlayer,
  DraftTournament,
  FinalizationReconciliation,
} from '../types';
import {
  countSelectedPacks,
  validateCheckpointShape,
  validateTournamentForPlayers,
} from '../utils/chaosDraftCheckpoint';

export class ChaosDraftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChaosDraftConflictError';
  }
}

export class ChaosDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChaosDraftValidationError';
  }
}

export interface CreateChaosDraftInput {
  ownerId: string;
  sessionId: string;
  players: DraftPlayer[];
  numPacks: number;
}

export interface CheckpointCommand {
  ownerId: string;
  sessionId: string;
  expectedRevision: number;
}

export interface ActiveChaosDraftRepository {
  get(ownerId: string): Promise<ActiveChaosDraft | null>;
  create(input: CreateChaosDraftInput): Promise<ActiveChaosDraft>;
  appendPack(
    command: CheckpointCommand,
    pack: DraftPackRef,
  ): Promise<CheckpointMutationResult>;
  undo(command: CheckpointCommand): Promise<CheckpointMutationResult>;
  saveTournament(
    command: CheckpointCommand,
    tournament: DraftTournament,
  ): Promise<CheckpointMutationResult>;
  discard(command: CheckpointCommand): Promise<void>;
  finalize(command: CheckpointCommand): Promise<{ draftId: string }>;
  reconcile(
    ownerId: string,
    expectedSessionId: string,
    finalDraftId: string,
  ): Promise<FinalizationReconciliation>;
}

export interface FirestoreTransactionAdapter {
  get(path: string): Promise<unknown | null>;
  create(path: string, value: Record<string, unknown>): void;
  update(path: string, value: Record<string, unknown>): void;
  delete(path: string): void;
}

export interface FirestoreAdapter {
  get(path: string): Promise<unknown | null>;
  generateId(collectionPath: string): string;
  serverTimestamp(): unknown;
  runTransaction<T>(
    operation: (transaction: FirestoreTransactionAdapter) => Promise<T>,
  ): Promise<T>;
}

interface InventoryPackDocument {
  id?: string;
  ownerId: string;
  name: string;
  imageUrl: string;
  inPerson: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkpointPath(ownerId: string): string {
  return `activeChaosDrafts/${ownerId}`;
}

function mutationResult(checkpoint: ActiveChaosDraft): CheckpointMutationResult {
  return {
    revision: checkpoint.revision,
    packsSelectedOrder: checkpoint.packsSelectedOrder,
    ...(checkpoint.pendingTournament
      ? { pendingTournament: checkpoint.pendingTournament }
      : {}),
  };
}

function readCheckpoint(value: unknown, ownerId: string): ActiveChaosDraft {
  try {
    validateCheckpointShape(value as ActiveChaosDraft, ownerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkpoint data is invalid.';
    throw new ChaosDraftValidationError(message);
  }
  return value as ActiveChaosDraft;
}

function validateCreateInput(input: CreateChaosDraftInput): void {
  if (!isNonEmptyString(input.ownerId) || !isNonEmptyString(input.sessionId)) {
    throw new ChaosDraftValidationError('Checkpoint owner and session are required.');
  }
  if (!Number.isInteger(input.numPacks) || input.numPacks <= 0) {
    throw new ChaosDraftValidationError('Checkpoint pack quantity must be a positive integer.');
  }
  if (!Array.isArray(input.players) || input.players.length < 2) {
    throw new ChaosDraftValidationError('At least two players are required.');
  }

  const ids = new Set<string>();
  for (const player of input.players) {
    if (
      !isNonEmptyString(player.id) ||
      !isNonEmptyString(player.name) ||
      (player.userId !== null && !isNonEmptyString(player.userId)) ||
      ids.has(player.id)
    ) {
      throw new ChaosDraftValidationError('Checkpoint players are invalid.');
    }
    ids.add(player.id);
  }
}

function validateCommand(command: CheckpointCommand): void {
  if (!isNonEmptyString(command.sessionId)) {
    throw new ChaosDraftValidationError('Checkpoint session is required.');
  }
  if (!Number.isInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw new ChaosDraftValidationError('Expected revision is invalid.');
  }
}

function requireCurrentCheckpoint(
  value: unknown,
  command: CheckpointCommand,
): ActiveChaosDraft {
  if (value === null) {
    throw new ChaosDraftConflictError('The active chaos draft no longer exists.');
  }

  const checkpoint = readCheckpoint(value, command.ownerId);
  if (
    checkpoint.sessionId !== command.sessionId ||
    checkpoint.revision !== command.expectedRevision
  ) {
    throw new ChaosDraftConflictError('The active chaos draft was updated elsewhere.');
  }
  return checkpoint;
}

function readInventoryPack(value: unknown, packId: string, ownerId: string): InventoryPackDocument {
  if (
    !isRecord(value) ||
    value.ownerId !== ownerId ||
    !isNonEmptyString(value.name) ||
    typeof value.imageUrl !== 'string' ||
    !Number.isInteger(value.inPerson) ||
    (value.inPerson as number) < 0
  ) {
    throw new ChaosDraftValidationError(`Selected pack ${packId} has invalid inventory data.`);
  }
  return value as unknown as InventoryPackDocument;
}

function validateTournament(checkpoint: ActiveChaosDraft, tournament: DraftTournament): void {
  if (checkpoint.packsSelectedOrder.length !== checkpoint.numPacks) {
    throw new ChaosDraftValidationError(
      'The chaos draft must be complete before saving its tournament.',
    );
  }
  try {
    validateTournamentForPlayers(tournament, checkpoint.players);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tournament Round 1 is invalid.';
    throw new ChaosDraftValidationError(message);
  }
}

export function createFirestoreAdapter(firestore: Firestore): FirestoreAdapter {
  return {
    async get(path) {
      const snapshot = await getDoc(doc(firestore, path));
      return snapshot.exists() ? snapshot.data() : null;
    },
    generateId(collectionPath) {
      return doc(collection(firestore, collectionPath)).id;
    },
    serverTimestamp,
    runTransaction(operation) {
      return runTransaction(firestore, async (firestoreTransaction) =>
        operation({
          async get(path) {
            const snapshot = await firestoreTransaction.get(doc(firestore, path));
            if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
              throw new Error('An authoritative server transaction snapshot is required.');
            }
            return snapshot.exists() ? snapshot.data() : null;
          },
          create(path, value) {
            firestoreTransaction.set(doc(firestore, path), value);
          },
          update(path, value) {
            firestoreTransaction.update(doc(firestore, path), value);
          },
          delete(path) {
            firestoreTransaction.delete(doc(firestore, path));
          },
        }),
      );
    },
  };
}

export function createActiveChaosDraftRepository(
  adapter: FirestoreAdapter,
  getCurrentUid: () => string | null,
): ActiveChaosDraftRepository {
  function requireOwner(ownerId: string): void {
    if (!isNonEmptyString(ownerId) || getCurrentUid() !== ownerId) {
      throw new ChaosDraftValidationError(
        'The signed-in admin is not authorized for this inventory owner.',
      );
    }
  }

  return {
    async get(ownerId) {
      requireOwner(ownerId);
      const value = await adapter.get(checkpointPath(ownerId));
      return value === null ? null : readCheckpoint(value, ownerId);
    },

    async create(input) {
      requireOwner(input.ownerId);
      validateCreateInput(input);
      const createdIdentity = await adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(input.ownerId);
        const existing = await transaction.get(path);
        if (existing !== null) {
          throw new ChaosDraftConflictError('An unfinished chaos draft already exists.');
        }

        const timestamp = adapter.serverTimestamp();
        const finalDraftId = adapter.generateId('drafts');
        transaction.create(path, {
          ownerId: input.ownerId,
          sessionId: input.sessionId,
          finalDraftId,
          revision: 0,
          players: input.players,
          numPacks: input.numPacks,
          packsSelectedOrder: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return { sessionId: input.sessionId, finalDraftId };
      });

      const committed = await adapter.get(checkpointPath(input.ownerId));
      if (committed === null) {
        throw new ChaosDraftValidationError('The created checkpoint could not be read.');
      }
      const checkpoint = readCheckpoint(committed, input.ownerId);
      if (
        checkpoint.sessionId !== createdIdentity.sessionId ||
        checkpoint.finalDraftId !== createdIdentity.finalDraftId
      ) {
        throw new ChaosDraftConflictError('The created chaos draft was replaced before it loaded.');
      }
      return checkpoint;
    },

    async appendPack(command, pack) {
      requireOwner(command.ownerId);
      validateCommand(command);
      if (!isNonEmptyString(pack.id)) {
        throw new ChaosDraftValidationError('A selected pack ID is required.');
      }

      return adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(command.ownerId);
        const checkpoint = requireCurrentCheckpoint(await transaction.get(path), command);
        if (checkpoint.packsSelectedOrder.length >= checkpoint.numPacks) {
          throw new ChaosDraftValidationError('The active chaos draft is already at capacity.');
        }

        const packValue = await transaction.get(`packs/${pack.id}`);
        if (packValue === null) {
          throw new ChaosDraftValidationError(`Selected pack ${pack.id} is missing from inventory.`);
        }
        const livePack = readInventoryPack(packValue, pack.id, command.ownerId);
        const reserved = checkpoint.packsSelectedOrder.filter(
          (selected) => selected.id === pack.id,
        ).length;
        if (livePack.inPerson < reserved + 1) {
          throw new ChaosDraftValidationError(
            `Selected pack ${pack.id} has insufficient quantity.`,
          );
        }

        const next: ActiveChaosDraft = {
          ...checkpoint,
          revision: checkpoint.revision + 1,
          packsSelectedOrder: [
            ...checkpoint.packsSelectedOrder,
            { id: pack.id, name: livePack.name, imageUrl: livePack.imageUrl },
          ],
        };
        transaction.update(path, {
          revision: next.revision,
          packsSelectedOrder: next.packsSelectedOrder,
          updatedAt: adapter.serverTimestamp(),
        });
        return mutationResult(next);
      });
    },

    async undo(command) {
      requireOwner(command.ownerId);
      validateCommand(command);
      return adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(command.ownerId);
        const checkpoint = requireCurrentCheckpoint(await transaction.get(path), command);
        if (checkpoint.packsSelectedOrder.length === 0) {
          throw new ChaosDraftValidationError('There is no selected pack to undo.');
        }

        const next: ActiveChaosDraft = {
          ...checkpoint,
          revision: checkpoint.revision + 1,
          packsSelectedOrder: checkpoint.packsSelectedOrder.slice(0, -1),
        };
        transaction.update(path, {
          revision: next.revision,
          packsSelectedOrder: next.packsSelectedOrder,
          updatedAt: adapter.serverTimestamp(),
        });
        return mutationResult(next);
      });
    },

    async saveTournament(command, tournament) {
      requireOwner(command.ownerId);
      validateCommand(command);
      return adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(command.ownerId);
        const checkpoint = requireCurrentCheckpoint(await transaction.get(path), command);
        validateTournament(checkpoint, tournament);

        const next: ActiveChaosDraft = {
          ...checkpoint,
          revision: checkpoint.revision + 1,
          pendingTournament: tournament,
        };
        transaction.update(path, {
          revision: next.revision,
          pendingTournament: tournament,
          updatedAt: adapter.serverTimestamp(),
        });
        return mutationResult(next);
      });
    },

    async discard(command) {
      requireOwner(command.ownerId);
      validateCommand(command);
      await adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(command.ownerId);
        requireCurrentCheckpoint(await transaction.get(path), command);
        transaction.delete(path);
      });
    },

    async finalize(command) {
      requireOwner(command.ownerId);
      validateCommand(command);
      return adapter.runTransaction(async (transaction) => {
        const path = checkpointPath(command.ownerId);
        const checkpoint = requireCurrentCheckpoint(await transaction.get(path), command);
        if (!checkpoint.pendingTournament) {
          throw new ChaosDraftValidationError('Persisted tournament Round 1 is required.');
        }
        validateTournament(checkpoint, checkpoint.pendingTournament);

        const draftPath = `drafts/${checkpoint.finalDraftId}`;
        if (await transaction.get(draftPath) !== null) {
          throw new ChaosDraftConflictError('The final draft already exists.');
        }

        const inventoryUpdates: { path: string; inPerson: number }[] = [];
        for (const [packId, selectedCount] of countSelectedPacks(checkpoint.packsSelectedOrder)) {
          const packPath = `packs/${packId}`;
          const livePack = readInventoryPack(await transaction.get(packPath), packId, checkpoint.ownerId);
          if (livePack.inPerson < selectedCount) {
            throw new ChaosDraftValidationError(`Selected pack ${packId} has insufficient quantity.`);
          }
          inventoryUpdates.push({ path: packPath, inPerson: livePack.inPerson - selectedCount });
        }

        transaction.create(draftPath, {
          type: 'chaos',
          createdBy: checkpoint.ownerId,
          createdAt: adapter.serverTimestamp(),
          status: 'finalized',
          finalizedAt: adapter.serverTimestamp(),
          finalizedBy: checkpoint.ownerId,
          sessionId: checkpoint.sessionId,
          players: checkpoint.players,
          packsSelectedOrder: checkpoint.packsSelectedOrder,
          restockComplete: false,
          tournament: checkpoint.pendingTournament,
        });
        for (const item of inventoryUpdates) {
          transaction.update(item.path, { inPerson: item.inPerson });
        }
        transaction.delete(path);
        return { draftId: checkpoint.finalDraftId };
      });
    },

    async reconcile(ownerId, expectedSessionId, finalDraftId) {
      requireOwner(ownerId);
      if (!isNonEmptyString(expectedSessionId) || !isNonEmptyString(finalDraftId)) {
        throw new ChaosDraftValidationError('The session and final draft IDs are required.');
      }
      return adapter.runTransaction(async (transaction) => {
        const draft = await transaction.get(`drafts/${finalDraftId}`);
        const checkpointValue = await transaction.get(checkpointPath(ownerId));
        if (draft !== null && checkpointValue === null) {
          if (
            !isRecord(draft) ||
            draft.type !== 'chaos' ||
            draft.status !== 'finalized' ||
            draft.createdBy !== ownerId ||
            draft.finalizedBy !== ownerId ||
            draft.sessionId !== expectedSessionId
          ) {
            return { status: 'integrity-error' };
          }
          return { status: 'committed', draftId: finalDraftId };
        }
        if (draft === null && checkpointValue !== null) {
          const checkpoint = readCheckpoint(checkpointValue, ownerId);
          if (
            checkpoint.sessionId !== expectedSessionId ||
            checkpoint.finalDraftId !== finalDraftId
          ) return { status: 'integrity-error' };
          return { status: 'not-committed', checkpoint };
        }
        return { status: 'integrity-error' };
      });
    },
  };
}

export const activeChaosDraftRepository = createActiveChaosDraftRepository(
  createFirestoreAdapter(db),
  () => auth.currentUser?.uid ?? null,
);
