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
  const [searchKey, setSearchKey] = useState(0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !addCount) return;
    setIsAdding(true);
    await addOrUpdateItem(selectedEntry.id, selectedEntry.name, selectedEntry.imageUrl, Math.max(1, Number(addCount)));
    setSelectedEntry(null);
    setAddCount('');
    setSearchKey(k => k + 1);
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Private Inventory</h2>
        <p className="text-gray-400 text-sm">{profile?.name}</p>
      </div>

      {/* Add pack */}
      <form onSubmit={handleAdd} className="p-6 bg-gray-800 rounded-2xl shadow-lg border border-gray-700">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-1">Pack</label>
            <div className="relative">
              <PackCatalogSearch
                key={searchKey}
                onSelect={entry => setSelectedEntry(entry)}
                clearOnSelect={false}
                placeholder="Search pack catalog to add…"
              />
              {selectedEntry && (
                <button
                  type="button"
                  onClick={() => { setSelectedEntry(null); setSearchKey(k => k + 1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
                  aria-label="Clear selection"
                >✕</button>
              )}
            </div>
          </div>
          <div className="w-full md:w-24">
            <label className="block text-sm font-medium text-gray-300 mb-1">Qty</label>
            <input
              type="number"
              min="1"
              value={addCount}
              onChange={e => setAddCount(e.target.value)}
              placeholder="0"
              className="block w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-sm font-medium text-gray-300 mb-1">&nbsp;</label>
            <button
              type="submit"
              disabled={isAdding || !selectedEntry}
              className="w-full md:w-auto py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 text-base disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Adding…' : 'Add Pack'}
            </button>
          </div>
        </div>
      </form>

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
