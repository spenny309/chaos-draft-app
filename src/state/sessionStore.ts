import { create } from "zustand";
import { useInventoryStore } from "./inventoryStore";
// ✅ CHANGED: Import the new Pack type from your Firebase inventoryStore
import { type Pack } from "./inventoryStore";

export interface Player {
  id: string;
  name: string;
  selectedPacks: Pack[]; // This now correctly uses the Firebase Pack type
}

export interface SessionState {
  sessionId: string;
  players: Player[];
  numPacks: number; // total packs in this session
  packsSelectedOrder: Pack[];
  tempInventory: Pack[];
  confirmed: boolean;

  initializeSession: (
    numPlayers: number,
    playerNames: string[],
    numPacks?: number
  ) => void;
  selectPackForNextPlayer: (pack: Pack) => void;
  resetSession: () => void;
  confirmSession: () => Promise<void>;
  undoLastPick: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: "",
  players: [],
  numPacks: 0,
  packsSelectedOrder: [],
  tempInventory: [],
  confirmed: false,

  // This function works as-is because it fetches from the (now Firebase-backed) inventoryStore
  initializeSession: (numPlayers, playerNames, numPacks) => {
    const { packs: inventory } = useInventoryStore.getState();
    const players: Player[] = [];

    for (let i = 0; i < numPlayers; i++) {
      players.push({
        id: `player-${i + 1}`,
        name: playerNames[i] || `Player ${i + 1}`,
        selectedPacks: [],
      });
    }

    set({
      sessionId: crypto.randomUUID(),
      players,
      numPacks: numPacks || numPlayers * 3,
      packsSelectedOrder: [],
      tempInventory: inventory.map((p) => ({ ...p })), // copy of inventory
      confirmed: false,
    });
  },

  // This function works as-is. All IDs are now strings, so `p.id === pack.id` is correct.
  selectPackForNextPlayer: (pack) => {
    const { players, packsSelectedOrder } = get();
    const nextIndex = packsSelectedOrder.length;
    const playerIndex = nextIndex % players.length;

    const updatedPlayers = [...players];
    updatedPlayers[playerIndex].selectedPacks.push(pack);

    // Decrement 'inPerson' quantity from tempInventory for the selected pack
    const tempInventory = get()
      .tempInventory.map((p) =>
        p.id === pack.id ? { ...p, inPerson: p.inPerson - 1 } : p
      )
      .filter((p) => p.inPerson > 0 || p.inTransit > 0); // Keep packs if they have any quantity

    set({
      players: updatedPlayers,
      packsSelectedOrder: [...packsSelectedOrder, pack],
      tempInventory,
    });
  },

  // This function works as-is, correctly pulling the fresh inventory from the store.
  resetSession: () => {
    const { players } = get();
    const { packs: inventory } = useInventoryStore.getState();
    const resetPlayers = players.map((p) => ({ ...p, selectedPacks: [] }));

    set({
      sessionId: crypto.randomUUID(),
      players: resetPlayers,
      packsSelectedOrder: [],
      tempInventory: inventory.map((p) => ({ ...p })),
      confirmed: false,
    });
  },

  // This function works as-is, calling the correct action in the Firebase store.
  confirmSession: async () => {
    const { packsSelectedOrder } = get();
    const { confirmSessionPicks } = useInventoryStore.getState();

    if (packsSelectedOrder.length === 0) {
      console.log("No packs selected, nothing to confirm.");
      return;
    }

    try {
      await confirmSessionPicks(packsSelectedOrder);
      set({ confirmed: true });
    } catch (error) {
      console.error("Failed to confirm session in store:", error);
    }
  },

  // This function works as-is. All IDs are now strings, so `p.id === lastPackSelected.id` is correct.
  undoLastPick: () => {
    const { packsSelectedOrder, players, tempInventory } = get();

    if (packsSelectedOrder.length === 0) return;

    const lastPackSelected = packsSelectedOrder[packsSelectedOrder.length - 1];
    const newPacksSelectedOrder = packsSelectedOrder.slice(0, -1);

    const playerIndex = (packsSelectedOrder.length - 1) % players.length;
    const updatedPlayers = [...players];
    updatedPlayers[playerIndex].selectedPacks = updatedPlayers[
      playerIndex
    ].selectedPacks.slice(0, -1);

    const packInTemp = tempInventory.find((p) => p.id === lastPackSelected.id);
    let newTempInventory;

    if (packInTemp) {
      newTempInventory = tempInventory.map((p) =>
        p.id === lastPackSelected.id ? { ...p, inPerson: p.inPerson + 1 } : p
      );
    } else {
      // If the pack was fully depleted, it was filtered out. Re-add it with a quantity of 1.
      const packToReAdd = { ...lastPackSelected, inPerson: 1 };
      newTempInventory = [...tempInventory, packToReAdd];
    }

    set({
      players: updatedPlayers,
      packsSelectedOrder: newPacksSelectedOrder,
      tempInventory: newTempInventory,
      confirmed: false,
    });
  },
}));
