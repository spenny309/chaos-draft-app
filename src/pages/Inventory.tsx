import { useState } from "react";
import { useInventoryStore } from "../state/inventoryStore";

export default function Inventory() {
  // Get loading state as well
  const { packs, loading, addPack, updatePack, deletePack, clearAll } =
    useInventoryStore();

  const [newPack, setNewPack] = useState({ name: "", imageUrl: "", quantity: 1 });
  const [showConfirm, setShowConfirm] = useState(false);
  // Add loading state for add button
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPack.name.trim()) return;

    setIsAdding(true); // Set loading
    await addPack({
      name: newPack.name,
      imageUrl:
        newPack.imageUrl || "https://placehold.co/200x280?text=No+Image",
      quantity: newPack.quantity,
    });
    setNewPack({ name: "", imageUrl: "", quantity: 1 });
    setIsAdding(false); // Unset loading
  };

  const handleClearAll = () => {
    clearAll();
    setShowConfirm(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 relative">
      <h2 className="text-2xl font-bold">📦 Inventory</h2>

      {/* Add New Pack Form */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col md:flex-row gap-4 items-end"
      >
        <div className="flex-1">
          <label className="block text-sm font-semibold mb-1">Pack Name</label>
          <input
            type="text"
            className="w-full rounded-md bg-gray-800 border border-gray-700 p-2"
            value={newPack.name}
            onChange={(e) => setNewPack({ ...newPack, name: e.target.value })}
            disabled={isAdding}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-semibold mb-1">Image URL</label>
          <input
            type="text"
            className="w-full rounded-md bg-gray-800 border border-gray-700 p-2"
            value={newPack.imageUrl}
            onChange={(e) =>
              setNewPack({ ...newPack, imageUrl: e.target.value })
            }
            disabled={isAdding}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Qty</label>
          <input
            type="number"
            min={1}
            className="w-20 rounded-md bg-gray-800 border border-gray-700 p-2"
            value={newPack.quantity}
            onChange={(e) =>
              setNewPack({ ...newPack, quantity: Number(e.target.value) })
            }
            disabled={isAdding}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md font-semibold w-full md:w-auto disabled:bg-gray-600"
          disabled={isAdding}
        >
          {isAdding ? "Adding..." : "Add"}
        </button>
      </form>

      {/* Loading Spinner for Grid */}
      {loading ? (
        <div className="text-center py-10">
          <p className="text-xl">Loading your packs...</p>
        </div>
      ) : (
        /* Pack Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="bg-gray-800 rounded-xl p-3 flex flex-col items-center text-center shadow-md"
            >
              <img
                src={pack.imageUrl}
                alt={pack.name}
                className="rounded-md mb-2 w-full aspect-[5/7] object-cover"
                // Add a placeholder fallback
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "https://placehold.co/200x280?text=No+Image";
                }}
              />
              <h3 className="font-semibold truncate w-full" title={pack.name}>
                {pack.name}
              </h3>
              <p className="text-sm text-gray-400">Qty: {pack.quantity}</p>

              <div className="flex gap-2 mt-3">
                <button
                  className="bg-green-600 hover:bg-green-700 text-sm px-2 py-1 rounded"
                  onClick={() =>
                    updatePack({ ...pack, quantity: pack.quantity + 1 })
                  }
                >
                  +1
                </button>
                <button
                  className="bg-yellow-600 hover:bg-yellow-700 text-sm px-2 py-1 rounded"
                  onClick={() =>
                    updatePack({
                      ...pack,
                      quantity: Math.max(0, pack.quantity - 1),
                    })
                  }
                >
                  -1
                </button>
                <button
                  className="bg-red-600 hover:bg-red-700 text-sm px-2 py-1 rounded"
                  onClick={() => deletePack(pack.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clear All Button */}
      {packs.length > 0 && !loading && (
        <div className="pt-6">
          <button
            className="bg-red-700 hover:bg-red-800 px-4 py-2 rounded-md"
            onClick={() => setShowConfirm(true)} // Show modal
          >
            Clear All
          </button>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg p-6 shadow-2xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-4">Are you sure?</h3>
            <p className="text-gray-300 mb-6">
              This will permanently delete all packs from your inventory.
            </p>
            <div className="flex justify-end gap-4">
              <button
                className="px-4 py-2 rounded-md font-semibold"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md font-semibold"
                onClick={handleClearAll}
              >
                Confirm Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}