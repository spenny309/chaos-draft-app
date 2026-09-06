import { create } from 'zustand';
import { auth } from '../firebase';
import { activeChaosDraftRepository } from '../repositories/activeChaosDraftRepository';
import type {
  ActiveChaosDraft,
  CheckpointMutationResult,
  DraftPlayer,
  DraftTournament,
  FinalizationReconciliation,
} from '../types';
import { reconstructChaosSession } from '../utils/chaosDraftCheckpoint';
import { shouldDiscoverChaosCheckpoint } from '../utils/chaosDraftAccess';
import { useInventoryStore, type Pack } from './inventoryStore';
import { useUserStore } from './userStore';

export interface Player {
  id: string;
  name: string;
  userId: string | null;
  selectedPacks: Pack[];
}

export interface SessionState {
  ownerId: string;
  sessionId: string;
  finalDraftId: string;
  revision: number;
  players: Player[];
  numPacks: number;
  packsSelectedOrder: Pack[];
  tempInventory: Pack[];
  confirmed: boolean;
  pendingTournament: DraftTournament | null;
  mutationPending: boolean;
  initializeSession(players: DraftPlayer[], numPacks?: number): Promise<void>;
  hydrateSession(checkpoint: ActiveChaosDraft): void;
  checkpointSelectedPack(pack: Pack): Promise<number>;
  applyCheckpointedPack(pack: Pack, committedRevision: number): void;
  undoLastPick(): Promise<void>;
  setPendingTournament(tournament: DraftTournament): Promise<void>;
  discardSession(): Promise<void>;
  confirmSession(): Promise<{ draftId: string }>;
  reconcileConfirmation(): Promise<FinalizationReconciliation>;
  clearLocalSession(): void;
}

const emptySession = {
  ownerId: '',
  sessionId: '',
  finalDraftId: '',
  revision: 0,
  players: [] as Player[],
  numPacks: 0,
  packsSelectedOrder: [] as Pack[],
  tempInventory: [] as Pack[],
  confirmed: false,
  pendingTournament: null as DraftTournament | null,
  mutationPending: false,
};

interface PendingAppend {
  generation: number;
  sessionId: string;
  baseRevision: number;
  packId: string;
  result: CheckpointMutationResult;
}

let checkpointSnapshot: ActiveChaosDraft | null = null;
let pendingAppend: PendingAppend | null = null;
let mutationGeneration = 0;

function requireActiveSession(state: SessionState): void {
  if (!state.ownerId || !state.sessionId || !state.finalDraftId || !checkpointSnapshot) {
    throw new Error('There is no active chaos draft session.');
  }
}

function requireMutationAvailable(state: SessionState): void {
  requireActiveSession(state);
  if (state.mutationPending) throw new Error('A chaos draft mutation is already pending.');
}

function commandFor(state: SessionState) {
  return {
    ownerId: state.ownerId,
    sessionId: state.sessionId,
    expectedRevision: state.revision,
  };
}

function checkpointFromMutation(
  state: SessionState,
  result: CheckpointMutationResult,
): ActiveChaosDraft {
  requireActiveSession(state);
  if (result.revision !== state.revision + 1) {
    throw new Error('The repository returned a stale checkpoint revision.');
  }

  return {
    ...checkpointSnapshot!,
    revision: result.revision,
    packsSelectedOrder: result.packsSelectedOrder,
    ...(result.pendingTournament
      ? { pendingTournament: result.pendingTournament }
      : { pendingTournament: undefined }),
  };
}

function reconstruct(checkpoint: ActiveChaosDraft) {
  return reconstructChaosSession(
    checkpoint,
    useInventoryStore.getState().packs,
    checkpoint.ownerId,
  );
}

function beginMutation(set: (state: Partial<SessionState>) => void): number {
  const generation = ++mutationGeneration;
  set({ mutationPending: true });
  return generation;
}

function mutationIsCurrent(generation: number): boolean {
  return mutationGeneration === generation;
}

function approvedOwnerIsCurrent(ownerId: string): boolean {
  const profile = useUserStore.getState().profile;
  return (
    auth.currentUser?.uid === ownerId &&
    profile?.uid === ownerId &&
    shouldDiscoverChaosCheckpoint(profile)
  );
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...emptySession,

  initializeSession: async (players, numPacks = players.length * 3) => {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('You must be signed in to start a chaos draft.');
    if (!approvedOwnerIsCurrent(ownerId)) {
      throw new Error('An approved admin account is required to start a chaos draft.');
    }
    if (get().mutationPending) throw new Error('A chaos draft mutation is already pending.');

    const generation = beginMutation(set);
    const sessionId = crypto.randomUUID();
    try {
      const checkpoint = await activeChaosDraftRepository.create({
        ownerId,
        sessionId,
        players: players.map((player) => ({ ...player })),
        numPacks,
      });
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed while it was being created.');
      }
      if (!approvedOwnerIsCurrent(ownerId)) {
        throw new Error('The approved admin account changed while the chaos draft was being created.');
      }
      get().hydrateSession(checkpoint);
    } catch (error) {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
      throw error;
    }
  },

  hydrateSession: (checkpoint) => {
    const view = reconstruct(checkpoint);
    mutationGeneration += 1;
    checkpointSnapshot = checkpoint;
    pendingAppend = null;
    set({
      ownerId: checkpoint.ownerId,
      sessionId: checkpoint.sessionId,
      finalDraftId: checkpoint.finalDraftId,
      revision: checkpoint.revision,
      players: view.players,
      numPacks: checkpoint.numPacks,
      packsSelectedOrder: view.packsSelectedOrder,
      tempInventory: view.tempInventory,
      confirmed: false,
      pendingTournament: checkpoint.pendingTournament ?? null,
      mutationPending: false,
    });
  },

  checkpointSelectedPack: async (pack) => {
    const state = get();
    requireMutationAvailable(state);
    const generation = beginMutation(set);

    try {
      const result = await activeChaosDraftRepository.appendPack(commandFor(state), {
        id: pack.id,
        name: pack.name,
        imageUrl: pack.imageUrl,
      });
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed while the pack was being saved.');
      }
      const canonicalCheckpoint = checkpointFromMutation(state, result);
      if (
        result.packsSelectedOrder.length !== state.packsSelectedOrder.length + 1 ||
        result.packsSelectedOrder.at(-1)?.id !== pack.id
      ) {
        throw new Error('The repository returned an unexpected selected pack.');
      }
      reconstruct(canonicalCheckpoint);
      pendingAppend = {
        generation,
        sessionId: state.sessionId,
        baseRevision: state.revision,
        packId: pack.id,
        result,
      };
      return result.revision;
    } catch (error) {
      if (mutationIsCurrent(generation)) {
        pendingAppend = null;
        set({ mutationPending: false });
      }
      throw error;
    }
  },

  applyCheckpointedPack: (pack, committedRevision) => {
    const state = get();
    const pending = pendingAppend;
    if (!pending || !state.mutationPending) {
      throw new Error('There is no checkpointed pack pending apply.');
    }
    if (
      pending.generation !== mutationGeneration ||
      pending.sessionId !== state.sessionId ||
      pending.baseRevision !== state.revision ||
      pending.packId !== pack.id ||
      committedRevision !== pending.result.revision ||
      committedRevision !== state.revision + 1
    ) {
      throw new Error('The checkpointed pack apply is stale.');
    }

    const checkpoint = checkpointFromMutation(state, pending.result);
    const view = reconstruct(checkpoint);
    checkpointSnapshot = checkpoint;
    pendingAppend = null;
    set({
      revision: checkpoint.revision,
      players: view.players,
      packsSelectedOrder: view.packsSelectedOrder,
      tempInventory: view.tempInventory,
      pendingTournament: checkpoint.pendingTournament ?? null,
      mutationPending: false,
    });
  },

  undoLastPick: async () => {
    const state = get();
    requireMutationAvailable(state);
    if (state.packsSelectedOrder.length === 0) throw new Error('There is no selected pack to undo.');
    const generation = beginMutation(set);

    try {
      const result = await activeChaosDraftRepository.undo(commandFor(state));
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed while undo was being saved.');
      }
      if (result.packsSelectedOrder.length !== state.packsSelectedOrder.length - 1) {
        throw new Error('The repository returned an unexpected undo result.');
      }
      const checkpoint = checkpointFromMutation(state, result);
      const view = reconstruct(checkpoint);
      checkpointSnapshot = checkpoint;
      set({
        revision: checkpoint.revision,
        players: view.players,
        packsSelectedOrder: view.packsSelectedOrder,
        tempInventory: view.tempInventory,
        pendingTournament: checkpoint.pendingTournament ?? null,
      });
    } finally {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
    }
  },

  setPendingTournament: async (tournament) => {
    const state = get();
    requireMutationAvailable(state);
    const generation = beginMutation(set);

    try {
      const result = await activeChaosDraftRepository.saveTournament(commandFor(state), tournament);
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed while Round 1 was being saved.');
      }
      if (!result.pendingTournament || result.packsSelectedOrder.length !== state.packsSelectedOrder.length) {
        throw new Error('The repository returned an unexpected tournament result.');
      }
      const checkpoint = checkpointFromMutation(state, result);
      const view = reconstruct(checkpoint);
      checkpointSnapshot = checkpoint;
      set({
        revision: checkpoint.revision,
        players: view.players,
        packsSelectedOrder: view.packsSelectedOrder,
        tempInventory: view.tempInventory,
        pendingTournament: result.pendingTournament,
      });
    } finally {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
    }
  },

  discardSession: async () => {
    const state = get();
    requireMutationAvailable(state);
    if (!approvedOwnerIsCurrent(state.ownerId)) {
      throw new Error('An approved admin account is required to discard this chaos draft.');
    }
    const generation = beginMutation(set);

    try {
      await activeChaosDraftRepository.discard(commandFor(state));
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed while it was being discarded.');
      }
      if (!approvedOwnerIsCurrent(state.ownerId)) {
        throw new Error('The approved admin account changed while the chaos draft was being discarded.');
      }
      get().clearLocalSession();
    } finally {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
    }
  },

  confirmSession: async () => {
    const state = get();
    requireMutationAvailable(state);
    if (state.packsSelectedOrder.length !== state.numPacks) {
      throw new Error('The chaos draft must be complete before confirmation.');
    }
    if (!state.pendingTournament) {
      throw new Error('Persisted tournament Round 1 is required before confirmation.');
    }
    const generation = beginMutation(set);

    try {
      const result = await activeChaosDraftRepository.finalize(commandFor(state));
      if (!mutationIsCurrent(generation) || result.draftId !== state.finalDraftId) {
        throw new Error('The finalized draft result does not match the active session.');
      }
      set({ confirmed: true });
      return result;
    } finally {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
    }
  },

  reconcileConfirmation: async () => {
    const state = get();
    requireMutationAvailable(state);
    const generation = beginMutation(set);

    try {
      const result = await activeChaosDraftRepository.reconcile(
        state.ownerId,
        state.sessionId,
        state.finalDraftId,
      );
      if (!mutationIsCurrent(generation)) {
        throw new Error('The chaos draft session changed during confirmation reconciliation.');
      }
      if (result.status === 'committed') {
        if (result.draftId !== state.finalDraftId) return { status: 'integrity-error' };
        set({ confirmed: true });
      } else if (result.status === 'not-committed') {
        if (
          result.checkpoint.ownerId !== state.ownerId ||
          result.checkpoint.sessionId !== state.sessionId ||
          result.checkpoint.finalDraftId !== state.finalDraftId
        ) {
          return { status: 'integrity-error' };
        }
        get().hydrateSession(result.checkpoint);
      }
      return result;
    } finally {
      if (mutationIsCurrent(generation)) set({ mutationPending: false });
    }
  },

  clearLocalSession: () => {
    mutationGeneration += 1;
    checkpointSnapshot = null;
    pendingAppend = null;
    set({ ...emptySession });
  },
}));
