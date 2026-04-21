import { useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import PackCatalogSearch from '../components/PackCatalogSearch';
import type { PackCatalogEntry } from '../types';

export default function PrivateInventory() {
  const { myItems, isLoading, addOrUpdateItem, updateCount, deleteItem } = usePrivateInventoryStore();
  const { profile } = useUserStore();
  const [selectedEntry, setSelectedEntry] = useState<PackCatalogEntry | null>(null);
  const [addCount, setAddCount] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSelect = (entry: PackCatalogEntry) => {
    setSelectedEntry(entry);
    setAddCount('1');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !addCount) return;
    setIsAdding(true);
    await addOrUpdateItem(selectedEntry.id, selectedEntry.name, selectedEntry.imageUrl, Math.max(1, Number(addCount)));
    setSelectedEntry(null);
    setAddCount('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Private Inventory</h2>
        <p className="text-gray-400 text-sm">{profile?.name}</p>
      </div>

      {/* Add pack */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Add Packs</h3>
        <PackCatalogSearch onSelect={handleSelect} clearOnSelect={false} />
        {selectedEntry && (
          <form onSubmit={handleAdd} className="flex items-center gap-3 mt-2">
            <img src={selectedEntry.imageUrl} alt={selectedEntry.name} className="w-8 h-10 object-cover rounded" />
            <span className="text-white text-sm flex-1">{selectedEntry.name}</span>
            <input
              type="number"
              min="1"
              value={addCount}
              onChange={e => setAddCount(e.target.value)}
              className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isAdding}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
            >
              Add
            </button>
            <button type="button" onClick={() => setSelectedEntry(null)} className="px-2 py-1.5 text-gray-400 hover:text-white text-sm">✕</button>
          </form>
        )}
      </div>

      {/* Inventory grid */}
      {isLoading && <div className="text-gray-400">Loading…</div>}
      {!isLoading && myItems.length === 0 && (
        <p className="text-gray-400 text-center py-8">No packs in your private inventory yet.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {myItems.map(item => (
          <div key={item.id} className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden">
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full aspect-[3/4] object-cover"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x280/1F2937/FFF?text=No+Image'; }}
            />
            <div className="p-3 flex flex-col gap-2">
              <p className="text-white text-xs font-medium text-center truncate">{item.name}</p>
              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => updateCount(item.id, Math.max(0, item.count - 1))}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                >−</button>
                <span className="text-white text-sm font-semibold">{item.count}</span>
                <button
                  onClick={() => updateCount(item.id, item.count + 1)}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                >+</button>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-red-400 hover:text-red-300 text-xs text-center"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
