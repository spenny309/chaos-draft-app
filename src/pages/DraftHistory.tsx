import { useState, useMemo } from "react";
import {
  useDraftHistoryStore,
  type DraftHistoryEntry,
  type DraftedPack,
} from "../state/draftHistoryStore";
import { useInventoryStore } from "../state/inventoryStore";

export default function DraftHistory() {
  const { drafts, loading, error, deleteDraft, markRestockComplete } =
    useDraftHistoryStore();

  const { packs: inventoryPacks, loading: inventoryLoading } =
    useInventoryStore();

  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  // --- ADDED STATE FOR MODAL ---
  const [selectedPack, setSelectedPack] = useState<DraftedPack | null>(null);

  const inventoryMap = useMemo(() => {
    if (inventoryLoading) return new Map<string, number>();
    // Map pack ID to its 'inPerson' quantity
    return new Map(inventoryPacks.map((p) => [p.id, p.inPerson]));
  }, [inventoryPacks, inventoryLoading]);

  const toggleExpand = (draftId: string) => {
    setExpandedDraftId((prevId) => (prevId === draftId ? null : draftId));
  };

  const handleDelete = (draft: DraftHistoryEntry) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this draft?\nAll packs from this draft will be added back to your 'Available' inventory."
      )
    ) {
      return;
    }
    deleteDraft(draft.id, draft.players);
  };

  // This component calculates and renders the restock alert
  const RestockAlert = ({ draft }: { draft: DraftHistoryEntry }) => {
    // Calculate the list of packs that need restocking
    const packsToRestock = useMemo(() => {
      // Use logical OR (||) to treat undefined as false
      if (draft.restockComplete || inventoryLoading) return [];

      const uniquePacks: Map<string, DraftedPack> = new Map();

      for (const player of draft.players) {
        for (const pack of player.packs) {
          // Check if we still have this pack in our inventory
          const inventoryCount = inventoryMap.get(pack.id) || 0;
          if (inventoryCount > 0) {
            // We have at least one left, so it needs to be replaced
            uniquePacks.set(pack.id, pack);
          }
        }
      }
      
      // --- 👇 THIS IS THE CHANGE ---
      // Convert map values to array and sort alphabetically by name
      const packArray = Array.from(uniquePacks.values());
      packArray.sort((a, b) => a.name.localeCompare(b.name));
      return packArray;
      // --- END OF CHANGE ---

    }, [draft, inventoryMap, inventoryLoading]); // Depends on the draft and the inventory

    // Use logical OR (||) to treat undefined as false
    if (draft.restockComplete) {
      return (
        <div className="mt-6 pt-6 border-t border-gray-700/50">
          <div className="p-4 rounded-lg bg-green-800/50 border border-green-600 text-center">
            <span className="font-semibold text-green-300">
              ✅ Restock Complete
            </span>
          </div>
        </div>
      );
    }

    if (packsToRestock.length === 0 && !inventoryLoading) {
      // No restock was ever needed (all packs drafted were the last ones)
      // We also wait for inventory to be loaded to make this decision
      return (
        <div className="mt-6 pt-6 border-t border-gray-700/50">
          <div className="p-4 rounded-lg bg-gray-700/50 text-center">
            <span className="font-semibold text-gray-400">
              No Restock Needed
            </span>
          </div>
        </div>
      );
    }

    if (packsToRestock.length > 0) {
      // If we are here, restock is needed and not complete
      return (
        <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-4">
          <div className="p-6 rounded-2xl bg-yellow-900/40 border-2 border-yellow-600/70">
            <h4 className="text-xl font-bold text-yellow-300 mb-4">
              ⚠️ Physical Pool Restock Needed
            </h4>
            <p className="text-yellow-200/80 mb-5">
              You drafted the following packs and have more in your inventory.
              Please add one of each to your physical draft box.
            </p>
            <div className="flex flex-wrap gap-4 mb-6">
              {packsToRestock.map((pack) => (
                <div key={pack.id} className="flex flex-col items-center gap-2">
                  {/* --- WRAPPED IMAGE IN BUTTON --- */}
                  <button
                    onClick={() => setSelectedPack(pack)}
                    className="focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded-md"
                  >
                    <img
                      src={pack.imageUrl}
                      alt={pack.name}
                      title={pack.name}
                      className="w-20 h-28 rounded-md object-cover border-2 border-yellow-600"
                    />
                  </button>
                  <span className="text-xs text-yellow-200/90 w-20 text-center truncate">
                    {pack.name}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => markRestockComplete(draft.id)}
              className="w-full py-3 px-5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg"
            >
              Mark Restock as Complete
            </button>
          </div>
        </div>
      );
    }

    // Default return while inventory is loading
    return null;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8">📜 Draft History</h2>
        <div className="text-center text-gray-400">Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8">📜 Draft History</h2>
        <div className="text-center text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">📜 Draft History</h2>

      {drafts.length === 0 ? (
        <div className="text-center text-gray-400 py-10 bg-gray-800 rounded-2xl">
          <h3 className="text-xl font-semibold">No Drafts Found</h3>
          <p>Complete a draft to see its history here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {drafts.map((draft) => {
            // --- UPDATED THIS LOGIC BLOCK ---
            let playerNames = "No players";
            const names = draft.players.map((p) => p.name);

            if (names.length === 1) {
              playerNames = names[0];
            } else if (names.length === 2) {
              playerNames = names.join(" and ");
            } else if (names.length > 2) {
              const allButLast = names.slice(0, -1).join(", ");
              const lastName = names[names.length - 1];
              playerNames = `${allButLast}, and ${lastName}`;
            }
            // --- END OF UPDATED LOGIC BLOCK ---

            return (
              <div
                key={draft.id}
                className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-6 transition-all duration-300"
              >
                <button
                  onClick={() => toggleExpand(draft.id)}
                  className="w-full flex justify-between items-center text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {" "}
                    {/* Added min-w-0 */}
                    {/* Show yellow dot if restock is needed */}
                    {(!draft.restockComplete && !inventoryLoading && (
                      <div
                        className="w-3 h-3 bg-yellow-400 rounded-full flex-shrink-0"
                        title="Restock Needed"
                      ></div>
                    ))}
                    {/* --- H3 IS UPDATED --- */}
                    <h3 className="text-xl font-bold text-blue-400 truncate">
                      Draft on{" "}
                      {draft.completedAt?.toDate().toLocaleDateString() ||
                        "Unknown Date"}{" "}
                      with {playerNames}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {" "}
                    {/* Added flex-shrink-0 */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-6 w-6 text-gray-400 transition-transform duration-300 ${
                        expandedDraftId === draft.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {expandedDraftId === draft.id && (
                  <div className="mt-6 pt-6 border-t border-gray-700 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {draft.players.map((player) => (
                        <div
                          key={player.id}
                          className="bg-gray-900/50 p-4 rounded-xl"
                        >
                          <h4 className="text-lg font-semibold mb-3 text-white">
                            {player.name}
                          </h4>
                          <div className="flex flex-wrap gap-3">
                            {player.packs.map((pack) => (
                              // --- WRAPPED IMAGE IN BUTTON ---
                              <button
                                key={pack.id}
                                onClick={() => setSelectedPack(pack)}
                                className="focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-md"
                              >
                                <img
                                  src={pack.imageUrl}
                                  alt={pack.name}
                                  title={pack.name}
                                  className="w-20 h-28 rounded-md object-cover border-2 border-gray-600 transition-all hover:border-blue-400"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Show restock alert or delete button */}
                    {!inventoryLoading && <RestockAlert draft={draft} />}

                    <div className="mt-6 pt-6 border-t border-gray-700/50 text-right">
                      <button
                        onClick={() => handleDelete(draft)}
                        className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 transition-colors"
                      >
                        Delete Draft & Revert Inventory
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* --- ADDED THIS ENTIRE MODAL --- */}
      {selectedPack && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-in fade-in duration-300"
          onClick={() => setSelectedPack(null)}
        >
          <div
            className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-2 border-gray-700 max-w-md animate-in slide-in-from-bottom-4 duration-500"
            onClick={(e) => e.stopPropagation()} // Prevent modal from closing when clicking inside
          >
            <div className="flex flex-col items-center gap-6">
              <div className="w-64 h-80 rounded-lg overflow-hidden shadow-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-gray-900">
                <img
                  src={selectedPack.imageUrl}
                  alt={selectedPack.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <h3 className="text-2xl font-bold text-blue-300 text-center">
                {selectedPack.name}
              </h3>
              <button
                onClick={() => setSelectedPack(null)}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transition-all hover:scale-105"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}