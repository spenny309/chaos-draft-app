import { useEffect, useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { distributePacksAcrossSets } from '../utils/allocationAlgorithm';
import type { PackCatalogEntry, DraftFormat, DraftPlayer, DraftAllocationEntry } from '../types';

interface RegularDraftPreviewProps {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  onBack: () => void;
  onSaved: (draftId: string) => void;
}

interface OverrideEntry {
  userId: string;
  userName: string;
  catalogId: string;
  name: string;
  available: number;
  count: number;
}

export default function RegularDraftPreview({
  players, sets, format, packsPerPerson, onBack, onSaved,
}: RegularDraftPreviewProps) {
  const { allItems, loadAllInventory } = usePrivateInventoryStore();
  const { allUsers, loadAllUsers } = useUserStore();
  const { computePreview, savePreview, wasRounded, previewAllocations } = useRegularDraftStore();
  const [overrides, setOverrides] = useState<Map<string, OverrideEntry[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    Promise.all([loadAllInventory(), loadAllUsers()]);
  }, []);

  useEffect(() => {
    if (allItems.length === 0 || allUsers.length === 0) return;

    const userMap = new Map(allUsers.map(u => [u.uid, u.name]));

    const { allocations } = computePreview(
      { players, sets, format, packsPerPerson },
      allItems
    );

    const newOverrides = new Map<string, OverrideEntry[]>();

    allocations.forEach(allocation => {
      const itemsForSet = allItems.filter(
        item => item.catalogId === allocation.catalogId && item.count > 0
      );

      const allContributors: OverrideEntry[] = itemsForSet.map(item => {
        const existing = allocation.contributions.find(c => c.userId === item.ownerId);
        return {
          userId: item.ownerId,
          userName: userMap.get(item.ownerId) ?? item.ownerId,
          catalogId: allocation.catalogId,
          name: allocation.name,
          available: item.count,
          count: existing?.count ?? 0,
        };
      });

      newOverrides.set(allocation.catalogId, allContributors);
    });

    setOverrides(newOverrides);
  }, [allItems, allUsers]);

  const handleCountChange = (catalogId: string, userId: string, rawValue: string) => {
    setValidationErrors(new Map()); // clear stale errors on any edit
    const value = Math.max(0, parseInt(rawValue) || 0);
    setOverrides(prev => {
      const next = new Map(prev);
      const entries = next.get(catalogId) ?? [];
      next.set(
        catalogId,
        entries.map(e => e.userId === userId ? { ...e, count: value } : e)
      );
      return next;
    });
  };

  const validate = (): boolean => {
    const errors = new Map<string, string>();
    const totalPacks = players.length * packsPerPerson;
    const { counts } = distributePacksAcrossSets(totalPacks, sets.length);

    sets.forEach((set, idx) => {
      const entries = overrides.get(set.id) ?? [];
      const total = entries.reduce((s, e) => s + e.count, 0);
      const needed = counts[idx];
      if (total !== needed) {
        errors.set(set.id, `Total must equal ${needed} (currently ${total})`);
      }
      const overAllocated = entries.find(e => e.count > e.available);
      if (overAllocated) {
        errors.set(set.id, `${overAllocated.userName} only has ${overAllocated.available} packs`);
      }
    });

    setValidationErrors(errors);
    return errors.size === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const flatAllocation: DraftAllocationEntry[] = [];
    for (const entries of overrides.values()) {
      for (const entry of entries) {
        if (entry.count > 0) {
          flatAllocation.push({
            userId: entry.userId,
            userName: entry.userName,
            catalogId: entry.catalogId,
            name: entry.name,
            count: entry.count,
          });
        }
      }
    }

    try {
      const draftId = await savePreview(
        { players, sets, format, packsPerPerson },
        previewAllocations,
        flatAllocation
      );
      onSaved(draftId);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    const { allocations } = computePreview(
      { players, sets, format, packsPerPerson },
      allItems
    );
    const userMap = new Map(allUsers.map(u => [u.uid, u.name]));
    const newOverrides = new Map<string, OverrideEntry[]>();

    allocations.forEach(allocation => {
      const itemsForSet = allItems.filter(
        item => item.catalogId === allocation.catalogId && item.count > 0
      );
      newOverrides.set(allocation.catalogId, itemsForSet.map(item => {
        const existing = allocation.contributions.find(c => c.userId === item.ownerId);
        return {
          userId: item.ownerId,
          userName: userMap.get(item.ownerId) ?? item.ownerId,
          catalogId: allocation.catalogId,
          name: allocation.name,
          available: item.count,
          count: existing?.count ?? 0,
        };
      }));
    });

    setOverrides(newOverrides);
    setValidationErrors(new Map());
  };

  const totalPacks = players.length * packsPerPerson;
  const { counts } = distributePacksAcrossSets(totalPacks, sets.length);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">Pack Allocation Preview</h2>
      </div>

      {wasRounded && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
          The total packs don't divide evenly across sets. Counts have been rounded using the largest-remainder method.
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-sm text-gray-300 space-y-1">
        <p><span className="text-gray-400">Format:</span> <span className="text-white font-medium">{format}</span></p>
        <p><span className="text-gray-400">Players:</span> <span className="text-white font-medium">{players.map(p => p.name).join(', ')}</span></p>
        <p><span className="text-gray-400">Packs per person:</span> <span className="text-white font-medium">{packsPerPerson} ({totalPacks} total)</span></p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleResetToDefault}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
        >
          Reset to Algorithm Default
        </button>
      </div>

      {sets.map((set, idx) => {
        const entries = overrides.get(set.id) ?? [];
        const setTotal = entries.reduce((s, e) => s + e.count, 0);
        const needed = counts[idx];
        const error = validationErrors.get(set.id);
        const setAlloc = previewAllocations.find(a => a.catalogId === set.id);

        return (
          <div key={set.id} className={`bg-gray-800 rounded-xl border p-5 space-y-4 ${error ? 'border-red-600' : 'border-gray-700'}`}>
            <div className="flex items-center gap-3">
              <img src={set.imageUrl} alt={set.name} className="w-10 object-cover rounded" style={{ height: '52px' }} />
              <div className="flex-1">
                <h3 className="text-white font-semibold">{set.name}</h3>
                <p className="text-gray-400 text-sm">
                  {setTotal}/{needed} packs allocated
                  {setAlloc && setAlloc.shortfall > 0 && (
                    <span className="text-red-400 ml-2">· shortage: {setAlloc.shortfall}</span>
                  )}
                </p>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {entries.length === 0 && (
              <p className="text-gray-400 text-sm">No one has packs of this set in their private inventory.</p>
            )}

            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.userId} className="flex items-center gap-3">
                  <span className="text-gray-300 text-sm flex-1">{entry.userName}</span>
                  <span className="text-gray-500 text-xs">({entry.available} available)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCountChange(set.id, entry.userId, String(Math.max(0, entry.count - 1)))}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                    >−</button>
                    <input
                      type="number"
                      min="0"
                      max={entry.available}
                      value={entry.count}
                      onChange={e => handleCountChange(set.id, entry.userId, e.target.value)}
                      className="w-14 px-1 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleCountChange(set.id, entry.userId, String(Math.min(entry.available, entry.count + 1)))}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button
        onClick={handleSave}
        disabled={saving || validationErrors.size > 0}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold rounded-xl text-base"
      >
        {saving ? 'Saving…' : 'Save Preview'}
      </button>
    </div>
  );
}
