import { create } from 'zustand';
import { auth, db } from '../firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  runTransaction,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useInventoryStore } from './inventoryStore';
import { usePrivateInventoryStore } from './privateInventoryStore';
import type { Draft, DraftPlayer, MtgColor, PairingResult, TournamentPairing, TournamentRound } from '../types';
import { sortColors } from '../utils/archetypes';

interface DraftHistoryState {
  drafts: Draft[];
  loading: boolean;
  error: string | null;
  loadDrafts: () => Promise<void>;
  clearDrafts: () => void;
  saveDraft: (draft: Omit<Draft, 'id' | 'createdAt'>) => Promise<string>;
  deleteDraft: (draftId: string) => Promise<void>;
  markRestockComplete: (draftId: string) => Promise<void>;
  linkDraftPlayers: (draftId: string, players: Draft['players']) => Promise<void>;
  updateTournament: (draftId: string, tournament: Draft['tournament']) => Promise<void>;
  submitResult: (draftId: string, roundNumber: number, pairingId: string, result: Omit<PairingResult, 'submittedBy' | 'submittedAt'>) => Promise<void>;
  addRound: (draftId: string, pairings: TournamentPairing[]) => Promise<void>;
  finalizeTournament: (draftId: string, userId: string) => Promise<void>;
  setPlayerArchetype: (draftId: string, playerId: string, primary: MtgColor[], splash: MtgColor[]) => Promise<void>;
  setPlayerDeckPhoto: (
    draftId: string,
    playerId: string,
    photo: { url: string; path: string } | null
  ) => Promise<void>;
}

async function updateDraftPlayerInTransaction(
  draftId: string,
  playerId: string,
  updatePlayer: (player: DraftPlayer) => DraftPlayer,
): Promise<DraftPlayer[] | null> {
  const draftRef = doc(db, 'drafts', draftId);
  let updatedPlayers: DraftPlayer[] | null = null;

  await runTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) return;

    const latestDraft = draftSnap.data() as Draft;
    const players = latestDraft.players ?? [];
    let found = false;

    updatedPlayers = players.map(player => {
      if (player.id !== playerId) return player;
      found = true;
      return updatePlayer(player);
    });

    if (!found) {
      updatedPlayers = null;
      return;
    }

    transaction.update(draftRef, { players: updatedPlayers });
  });

  return updatedPlayers;
}

export const useDraftHistoryStore = create<DraftHistoryState>((set, get) => ({
  drafts: [],
  loading: true,
  error: null,

  loadDrafts: async () => {
    set({ loading: true, error: null });
    try {
      // All approved users can see all drafts — no userId filter
      const q = query(collection(db, 'drafts'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const drafts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Draft));
      set({ drafts, loading: false });
    } catch (err) {
      console.error('Error fetching draft history:', err);
      set({ error: 'Failed to load draft history.', loading: false });
    }
  },

  clearDrafts: () => set({ drafts: [], loading: false, error: null }),

  saveDraft: async (draft) => {
    const docRef = await addDoc(collection(db, 'drafts'), {
      ...draft,
      createdAt: serverTimestamp(),
    });
    await get().loadDrafts();
    return docRef.id;
  },

  deleteDraft: async (draftId) => {
    const user = auth.currentUser;
    if (!user) return;

    const draftDoc = get().drafts.find(d => d.id === draftId);
    if (!draftDoc) return;

    // For chaos drafts, revert inventory on delete
    if (draftDoc.type === 'chaos' && draftDoc.packsSelectedOrder) {
      const packCounts = new Map<string, number>();
      for (const pack of draftDoc.packsSelectedOrder) {
        packCounts.set(pack.id, (packCounts.get(pack.id) || 0) + 1);
      }

      await runTransaction(db, async (transaction) => {
        const draftDocRef = doc(db, 'drafts', draftId);
        const draftSnap = await transaction.get(draftDocRef);
        if (!draftSnap.exists()) throw new Error('Draft not found.');

        const updates: { ref: ReturnType<typeof doc>; newQty: number }[] = [];
        for (const [packId, count] of packCounts.entries()) {
          const packDocRef = doc(db, 'packs', packId);
          const packSnap = await transaction.get(packDocRef);
          if (packSnap.exists()) {
            updates.push({ ref: packDocRef, newQty: (packSnap.data().inPerson || 0) + count });
          }
        }
        for (const { ref, newQty } of updates) {
          transaction.update(ref, { inPerson: newQty });
        }
        transaction.delete(draftDocRef);
      });

      useInventoryStore.getState().loadPacks();
    } else {
      if (draftDoc.status === 'finalized' && draftDoc.allocation?.length) {
        await usePrivateInventoryStore.getState().batchRestore(draftDoc.allocation);
      }
      await runTransaction(db, async (transaction) => {
        const draftDocRef = doc(db, 'drafts', draftId);
        const snap = await transaction.get(draftDocRef);
        if (!snap.exists()) throw new Error('Draft not found.');
        transaction.delete(draftDocRef);
      });
    }

    set(state => ({ drafts: state.drafts.filter(d => d.id !== draftId) }));
  },

  markRestockComplete: async (draftId) => {
    await updateDoc(doc(db, 'drafts', draftId), { restockComplete: true });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, restockComplete: true } : d),
    }));
  },

  linkDraftPlayers: async (draftId, players) => {
    await updateDoc(doc(db, 'drafts', draftId), { players });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, players } : d),
    }));
  },

  updateTournament: async (draftId, tournament) => {
    await updateDoc(doc(db, 'drafts', draftId), { tournament });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament } : d),
    }));
  },

  submitResult: async (draftId, roundNumber, pairingId, result) => {
    const draftRef = doc(db, 'drafts', draftId);
    let updatedTournament: Draft['tournament'];

    await runTransaction(db, async (transaction) => {
      const draftSnap = await transaction.get(draftRef);
      if (!draftSnap.exists()) return;

      const latestDraft = draftSnap.data() as Draft;
      if (!latestDraft.tournament) return;

      const targetRound = latestDraft.tournament.rounds.find(r => r.roundNumber === roundNumber);
      if (!targetRound) return;
      const targetPairing = targetRound.pairings.find(p => p.id === pairingId);
      if (!targetPairing || targetPairing.result) return;

      const fullResult: PairingResult = {
        ...result,
        submittedBy: auth.currentUser?.uid ?? '',
        submittedAt: Timestamp.now(),
      };

      updatedTournament = {
        ...latestDraft.tournament,
        rounds: latestDraft.tournament.rounds.map(round => {
          if (round.roundNumber !== roundNumber) return round;
          const updatedPairings = round.pairings.map(p =>
            p.id !== pairingId ? p : { ...p, result: fullResult, status: 'complete' as const }
          );
          const nonByePairings = updatedPairings.filter(p => p.player2Id !== null);
          const allComplete = nonByePairings.length > 0 && nonByePairings.every(p => p.status === 'complete');
          return { ...round, pairings: updatedPairings, status: allComplete ? 'complete' as const : 'active' as const };
        }),
      };

      transaction.update(draftRef, { tournament: updatedTournament });
    });

    if (!updatedTournament) return;

    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
    }));
  },

  addRound: async (draftId, pairings) => {
    const draft = get().drafts.find(d => d.id === draftId);
    if (!draft?.tournament) return;

    const nextRoundNumber = draft.tournament.currentRound + 1;
    const newRound: TournamentRound = {
      roundNumber: nextRoundNumber,
      pairings,
      status: 'active',
    };
    const updatedTournament = {
      ...draft.tournament,
      rounds: [...draft.tournament.rounds, newRound],
      currentRound: nextRoundNumber,
    };

    await updateDoc(doc(db, 'drafts', draftId), { tournament: updatedTournament });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
    }));
  },

  finalizeTournament: async (draftId, userId) => {
    const draft = get().drafts.find(d => d.id === draftId);
    if (!draft?.tournament) return;

    const updatedTournament = {
      ...draft.tournament,
      status: 'finalized' as const,
      finalizedAt: Timestamp.now(),
      finalizedBy: userId,
    };

    await updateDoc(doc(db, 'drafts', draftId), { tournament: updatedTournament });
    set(state => ({
      drafts: state.drafts.map(d => d.id === draftId ? { ...d, tournament: updatedTournament } : d),
    }));
  },

  setPlayerArchetype: async (draftId, playerId, primary, splash) => {
    const sortedPrimary = sortColors(primary);
    const sortedSplash = sortColors(splash);

    const updatedPlayers = await updateDraftPlayerInTransaction(draftId, playerId, player => {
      if (sortedPrimary.length === 0) {
        const { primaryColors: _primary, splashColors: _splash, ...rest } = player;
        return rest;
      }
      const { splashColors: _oldSplash, ...rest } = player;
      return {
        ...rest,
        primaryColors: sortedPrimary,
        ...(sortedSplash.length > 0 ? { splashColors: sortedSplash } : {}),
      };
    });

    if (!updatedPlayers) return;

    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId ? { ...d, players: updatedPlayers } : d,
      ),
    }));
  },

  setPlayerDeckPhoto: async (draftId, playerId, photo) => {
    const uploadedAt = photo ? Timestamp.now() : null;

    const updatedPlayers = await updateDraftPlayerInTransaction(draftId, playerId, player => {
      const {
        deckPhotoUrl: _oldUrl,
        deckPhotoPath: _oldPath,
        deckPhotoUploadedAt: _oldUploadedAt,
        ...rest
      } = player;

      if (!photo) return rest;

      return {
        ...rest,
        deckPhotoUrl: photo.url,
        deckPhotoPath: photo.path,
        deckPhotoUploadedAt: uploadedAt!,
      };
    });

    if (!updatedPlayers) return;

    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId ? { ...d, players: updatedPlayers } : d,
      ),
    }));
  },
}));
