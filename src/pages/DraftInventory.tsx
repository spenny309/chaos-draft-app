import { useEffect, useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';

interface AggregatedPack {
  catalogId: string;
  name: string;
  imageUrl: string;
  total: number;
  contributors: { userId: string; userName: string; count: number }[];
}

export default function DraftInventory() {
  const { allItems, isLoading, loadAllInventory } = usePrivateInventoryStore();
  const { publicProfiles } = useUserStore();
  const [showBreakdowns, setShowBreakdowns] = useState(true);

  useEffect(() => {
    loadAllInventory();
  }, []);

  const userNameMap = new Map(publicProfiles.map(u => [u.uid, u.name]));

  // Aggregate by catalogId
  const aggregated = new Map<string, AggregatedPack>();
  for (const item of allItems) {
    if (item.count <= 0) continue;
    const existing = aggregated.get(item.catalogId);
    const userName = userNameMap.get(item.ownerId) ?? 'Unknown';
    if (existing) {
      existing.total += item.count;
      existing.contributors.push({ userId: item.ownerId, userName, count: item.count });
    } else {
      aggregated.set(item.catalogId, {
        catalogId: item.catalogId,
        name: item.name,
        imageUrl: item.imageUrl,
        total: item.count,
        contributors: [{ userId: item.ownerId, userName, count: item.count }],
      });
    }
  }

  const packs = [...aggregated.values()].sort((a, b) => {
    if (a.total > 0 && b.total === 0) return -1;
    if (a.total === 0 && b.total > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Draft Inventory</h2>
        <div className="flex items-center gap-3">
          <p className="text-gray-400 text-sm">{packs.length} pack types · {[...aggregated.values()].reduce((s, p) => s + p.total, 0)} total</p>
          <button
            onClick={() => setShowBreakdowns(v => !v)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            {showBreakdowns ? 'Hide breakdown' : 'Show breakdown'}
          </button>
        </div>
      </div>
      <p className="text-gray-400 text-sm">Combined view of all users' private inventories. Read-only.</p>

      {isLoading && <div className="text-gray-400">Loading…</div>}
      {!isLoading && packs.length === 0 && (
        <p className="text-gray-400 text-center py-8">No packs in any private inventory yet.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {packs.map(pack => (
          <div
            key={pack.catalogId}
            className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden"
          >
            <img
              src={pack.imageUrl}
              alt={pack.name}
              className="w-full aspect-[3/4] object-cover"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x280/1F2937/FFF?text=No+Image'; }}
            />
            <div className="p-3 space-y-1">
              <p className="text-white text-xs font-medium text-center truncate">{pack.name}</p>
              <p className="text-blue-400 text-sm font-bold text-center">{pack.total}</p>
              {showBreakdowns && (
                <div className="mt-2 space-y-1 border-t border-gray-700 pt-2">
                  {pack.contributors.sort((a, b) => b.count - a.count).map(c => (
                    <div key={c.userId} className="flex justify-between text-xs text-gray-300">
                      <span>{c.userName}</span>
                      <span className="font-semibold">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
