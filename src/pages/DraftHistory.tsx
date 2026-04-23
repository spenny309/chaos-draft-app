import { useState, useMemo } from "react";
import { useDraftHistoryStore } from "../state/draftHistoryStore";
import { useInventoryStore } from "../state/inventoryStore";
import { useUserStore } from "../state/userStore";
import { useRegularDraftStore } from "../state/regularDraftStore";
import { usePrivateInventoryStore } from "../state/privateInventoryStore";
import type { Draft, DraftPackRef } from "../types";

const typeBadgeColors: Record<string, string> = {
  chaos: 'bg-purple-700 text-purple-200',
  regular: 'bg-blue-700 text-blue-200',
  mobius: 'bg-green-700 text-green-200',
  sealed: 'bg-yellow-700 text-yellow-200',
  'team-sealed': 'bg-orange-700 text-orange-200',
};

const typeBadgeLabels: Record<string, string> = {
  chaos: 'Chaos',
  regular: 'Regular',
  mobius: 'Mobius',
  sealed: 'Sealed',
  'team-sealed': 'Team Sealed',
};

interface RestockAlertProps {
  draft: Draft;
  inventoryMap: Map<string, number>;
  inventoryLoading: boolean;
  markRestockComplete: (id: string) => Promise<void>;
}

function RestockAlert({ draft, inventoryMap, inventoryLoading, markRestockComplete }: RestockAlertProps) {
  const [selectedPack, setSelectedPack] = useState<DraftPackRef | null>(null);

  const packsToRestock = useMemo(() => {
    if (draft.restockComplete || inventoryLoading) return [];
    if (draft.type !== 'chaos' || !draft.packsSelectedOrder) return [];

    const uniquePacks: Map<string, DraftPackRef> = new Map();

    for (const pack of draft.packsSelectedOrder) {
      const inventoryCount = inventoryMap.get(pack.id) || 0;
      if (inventoryCount > 0) {
        uniquePacks.set(pack.id, pack);
      }
    }

    const packArray = Array.from(uniquePacks.values());
    packArray.sort((a, b) => a.name.localeCompare(b.name));
    return packArray;
  }, [draft, inventoryMap, inventoryLoading]);

  if (draft.type !== 'chaos') return null;

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
        {selectedPack && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-in fade-in duration-300"
            onClick={() => setSelectedPack(null)}
          >
            <div
              className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-2 border-gray-700 max-w-md animate-in slide-in-from-bottom-4 duration-500"
              onClick={(e) => e.stopPropagation()}
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

  return null;
}

export default function DraftHistory() {
  const { drafts, loading, error, deleteDraft, markRestockComplete, loadDrafts } =
    useDraftHistoryStore();

  const { packs: inventoryPacks, loading: inventoryLoading } =
    useInventoryStore();

  const { profile } = useUserStore();
  const { finalizeDraft } = useRegularDraftStore();
  const { batchDeduct } = usePrivateInventoryStore();

  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<DraftPackRef | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [finalizing, setFinalizing] = useState<string | null>(null);

  const inventoryMap = useMemo(() => {
    if (inventoryLoading) return new Map<string, number>();
    return new Map(inventoryPacks.map((p) => [p.id, p.inPerson]));
  }, [inventoryPacks, inventoryLoading]);

  const filtered = typeFilter === 'all'
    ? drafts
    : drafts.filter(d => d.type === typeFilter);

  const toggleExpand = (draftId: string) => {
    setExpandedDraftId((prevId) => (prevId === draftId ? null : draftId));
  };

  const handleDelete = (draft: Draft) => {
    if (
      !window.confirm(
        draft.type === 'chaos'
          ? "Are you sure you want to delete this draft?\nAll packs from this draft will be added back to the 'Available' inventory."
          : "Are you sure you want to delete this draft?"
      )
    ) {
      return;
    }
    deleteDraft(draft.id);
  };

  const handleFinalize = async (draft: Draft) => {
    if (!draft.allocation) return;
    setFinalizing(draft.id);
    try {
      await batchDeduct(draft.allocation);
      await finalizeDraft(draft.id, draft.allocation);
      await loadDrafts();
    } finally {
      setFinalizing(null);
    }
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

      <div className="flex items-center gap-3 mb-4">
        <label className="text-gray-400 text-sm">Filter:</label>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
        >
          <option value="all">All Drafts</option>
          <option value="chaos">Chaos</option>
          <option value="regular">Regular</option>
          <option value="mobius">Mobius</option>
          <option value="sealed">Sealed</option>
          <option value="team-sealed">Team Sealed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-10 bg-gray-800 rounded-2xl">
          <h3 className="text-xl font-semibold">No Drafts Found</h3>
          <p>Complete a draft to see its history here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((draft) => {
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
                    {draft.type === 'chaos' && !draft.restockComplete && !inventoryLoading && (
                      <div
                        className="w-3 h-3 bg-yellow-400 rounded-full flex-shrink-0"
                        title="Restock Needed"
                      ></div>
                    )}
                    <h3 className="text-xl font-bold text-blue-400 truncate">
                      {draft.type.charAt(0).toUpperCase() + draft.type.slice(1)} Draft on{" "}
                      {draft.createdAt?.toDate().toLocaleDateString() ||
                        "Unknown Date"}{" "}
                      with {playerNames}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${typeBadgeColors[draft.type] ?? 'bg-gray-700 text-gray-300'}`}>
                      {typeBadgeLabels[draft.type] ?? draft.type}
                    </span>
                    {draft.status === 'preview' && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-800 text-yellow-200 flex-shrink-0">Preview</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
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
                    <div className="mb-4">
                      <span className="text-sm text-gray-400 uppercase tracking-wide font-semibold">
                        Players
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {draft.players.map((player) => (
                          <span
                            key={player.id}
                            className="bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm"
                          >
                            {player.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {draft.type === 'chaos' && draft.packsSelectedOrder && (
                      <div className="mb-4">
                        <span className="text-sm text-gray-400 uppercase tracking-wide font-semibold">
                          Packs Drafted
                        </span>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {draft.packsSelectedOrder.map((pack, idx) => (
                            <button
                              key={`${pack.id}-${idx}`}
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
                    )}

                    {draft.type !== 'chaos' && draft.sets && (
                      <div className="space-y-2 mb-4">
                        <p className="text-gray-400 text-sm font-medium">Sets:</p>
                        {draft.sets.map(s => (
                          <div key={s.catalogId} className="flex items-center gap-2 text-sm text-gray-300">
                            <img src={s.imageUrl} alt={s.name} className="w-5 h-6 object-cover rounded" />
                            <span>{s.name}</span>
                            <span className="text-gray-500">({s.totalNeeded} packs)</span>
                          </div>
                        ))}
                        {draft.allocation && draft.allocation.length > 0 && (
                          <div className="mt-3">
                            <p className="text-gray-400 text-sm font-medium mb-1">Allocation:</p>
                            {draft.allocation.map((a, i) => (
                              <div key={i} className="flex justify-between text-xs text-gray-300">
                                <span>{a.userName} — {a.name}</span>
                                <span className="font-semibold">{a.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!inventoryLoading && (
                      <RestockAlert
                        draft={draft}
                        inventoryMap={inventoryMap}
                        inventoryLoading={inventoryLoading}
                        markRestockComplete={markRestockComplete}
                      />
                    )}

                    {profile?.role === 'admin' && draft.status === 'preview' && draft.type !== 'chaos' && (
                      <button
                        onClick={() => handleFinalize(draft)}
                        disabled={finalizing === draft.id}
                        className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
                      >
                        {finalizing === draft.id ? 'Finalizing…' : 'Finalize Draft'}
                      </button>
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-700/50 text-right">
                      <button
                        onClick={() => handleDelete(draft)}
                        className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 transition-colors"
                      >
                        Delete Draft{draft.type === 'chaos' ? ' & Revert Inventory' : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedPack && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-in fade-in duration-300"
          onClick={() => setSelectedPack(null)}
        >
          <div
            className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-2 border-gray-700 max-w-md animate-in slide-in-from-bottom-4 duration-500"
            onClick={(e) => e.stopPropagation()}
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
