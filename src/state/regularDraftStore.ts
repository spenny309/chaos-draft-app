import { create } from 'zustand';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { allocateRegularDraft, distributePacksAcrossSets } from '../utils/allocationAlgorithm';
import type {
  DraftPlayer,
  DraftSetRef,
  DraftAllocationEntry,
  DraftFormat,
  PackCatalogEntry,
  PrivateInventoryItem,
} from '../types';

export interface RegularDraftConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
}

export interface SetAllocationWithMeta {
  catalogId: string;
  name: string;
  imageUrl: string;
  totalNeeded: number;
  contributions: { userId: string; userName: string; count: number; available: number }[];
  shortfall: number;
}

interface RegularDraftStore {
  config: RegularDraftConfig | null;
  previewAllocations: SetAllocationWithMeta[];
  wasRounded: boolean;
  savedDraftId: string | null;
  isLoading: boolean;
  setConfig: (config: RegularDraftConfig) => void;
  computePreview: (config: RegularDraftConfig, allPrivateInventory: PrivateInventoryItem[]) => {
    allocations: SetAllocationWithMeta[];
    wasRounded: boolean;
  };
  savePreview: (
    config: RegularDraftConfig,
    allocations: SetAllocationWithMeta[],
    overrides: DraftAllocationEntry[]
  ) => Promise<string>;
  finalizeDraft: (draftId: string, allocation: DraftAllocationEntry[]) => Promise<void>;
  reset: () => void;
}

export const useRegularDraftStore = create<RegularDraftStore>((set) => ({
  config: null,
  previewAllocations: [],
  wasRounded: false,
  savedDraftId: null,
  isLoading: false,

  setConfig: (config) => set({ config }),

  computePreview: (config, allPrivateInventory) => {
    const totalPacks = config.players.length * config.packsPerPerson;
    const { counts, wasRounded } = distributePacksAcrossSets(totalPacks, config.sets.length);

    // Build per-set availability maps
    const participantUserIds = new Set(
      config.players.map(p => p.userId).filter(Boolean) as string[]
    );

    // Build a name map: userId -> name
    // Players provide names for participants; for non-participants we won't have a name here
    // so we'll need the allUsers context — but since we only have allPrivateInventory,
    // use player names for participants and userId as fallback for non-participants
    const playerNameMap = new Map(
      config.players
        .filter(p => p.userId !== null)
        .map(p => [p.userId as string, p.name])
    );

    const allocations: SetAllocationWithMeta[] = config.sets.map((catalogEntry, i) => {
      const totalNeeded = counts[i];
      const itemsForSet = allPrivateInventory.filter(
        item => item.catalogId === catalogEntry.id && item.count > 0
      );

      const toContributor = (item: PrivateInventoryItem) => ({
        userId: item.ownerId,
        userName: playerNameMap.get(item.ownerId) ?? item.ownerId,
        available: item.count,
      });

      const participantItems = itemsForSet.filter(item =>
        participantUserIds.has(item.ownerId)
      );
      const nonParticipantItems = itemsForSet.filter(item =>
        !participantUserIds.has(item.ownerId)
      );

      const result = allocateRegularDraft([{
        catalogId: catalogEntry.id,
        name: catalogEntry.name,
        totalNeeded,
        participants: participantItems.map(toContributor),
        nonParticipants: nonParticipantItems.map(toContributor),
      }])[0];

      // Enrich contributions with available counts and userNames (from allPrivateInventory)
      const enriched = result.contributions.map(c => {
        const item = itemsForSet.find(i => i.ownerId === c.userId);
        return { ...c, available: item?.count ?? 0 };
      });

      return {
        catalogId: catalogEntry.id,
        name: catalogEntry.name,
        imageUrl: catalogEntry.imageUrl,
        totalNeeded,
        contributions: enriched,
        shortfall: result.shortfall,
      };
    });

    set({ previewAllocations: allocations, wasRounded });
    return { allocations, wasRounded };
  },

  savePreview: async (config, allocations, overrides) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    if (config.cubeId) {
      const cubeDoc: Record<string, unknown> = {
        type: config.format === 'Regular Draft' ? 'regular'
          : config.format === 'Mobius Draft' ? 'mobius'
          : config.format === 'Sealed' ? 'sealed'
          : 'team-sealed',
        createdBy: uid,
        createdAt: serverTimestamp(),
        status: 'finalized',
        players: config.players,
        packsPerPerson: config.packsPerPerson,
        cubeId: config.cubeId,
        finalizedAt: serverTimestamp(),
        finalizedBy: uid,
      };
      if (config.cubeName) cubeDoc.cubeName = config.cubeName;
      if (config.cubeImageUrl) cubeDoc.cubeImageUrl = config.cubeImageUrl;
      if (config.cubeExternalUrl) cubeDoc.cubeExternalUrl = config.cubeExternalUrl;
      const docRef = await addDoc(collection(db, 'drafts'), cubeDoc);
      set({ savedDraftId: docRef.id });
      return docRef.id;
    }

    const sets: DraftSetRef[] = allocations.map(a => ({
      catalogId: a.catalogId,
      name: a.name,
      imageUrl: a.imageUrl,
      totalNeeded: a.totalNeeded,
    }));

    const docRef = await addDoc(collection(db, 'drafts'), {
      type: config.format === 'Regular Draft' ? 'regular'
        : config.format === 'Mobius Draft' ? 'mobius'
        : config.format === 'Sealed' ? 'sealed'
        : 'team-sealed',
      createdBy: uid,
      createdAt: serverTimestamp(),
      status: 'preview',
      players: config.players,
      sets,
      packsPerPerson: config.packsPerPerson,
      finalizedAt: null,
      finalizedBy: null,
      allocation: overrides,
    });

    set({ savedDraftId: docRef.id });
    return docRef.id;
  },

  finalizeDraft: async (draftId, allocation) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    // Deduction is handled by privateInventoryStore.batchDeduct — called from the UI
    await updateDoc(doc(db, 'drafts', draftId), {
      status: 'finalized',
      finalizedAt: serverTimestamp(),
      finalizedBy: uid,
      allocation,
    });
  },

  reset: () => set({
    config: null,
    previewAllocations: [],
    wasRounded: false,
    savedDraftId: null,
  }),
}));
