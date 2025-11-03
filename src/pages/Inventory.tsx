import { useState } from "react";
// Assuming state is in src/state
import { useInventoryStore, type Pack } from "../state/inventoryStore";
import { auth } from "../firebase";

export default function Inventory() {
  const { packs, loading, addPack, updatePack, deletePack, clearAll } =
    useInventoryStore();

  // ✅ Broke state into individual fields for better control
  const [newPackName, setNewPackName] = useState("");
  const [newPackImageUrl, setNewPackImageUrl] = useState("");
  const [newPackQuantity, setNewPackQuantity] = useState(""); // ✅ Changed to string

  const [isAdding, setIsAdding] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackName.trim() || isAdding || !auth.currentUser) return;

    // ✅ Parse the quantity string, defaulting to 1 if empty or invalid
    const quantity = Math.max(1, Number(newPackQuantity) || 1);

    setIsAdding(true);
    await addPack({
      name: newPackName,
      imageUrl:
        newPackImageUrl ||
        "https://placehold.co/200x280/1F2937/FFF?text=No+Image",
      quantity: quantity,
    });

    // ✅ Reset all fields to empty
    setNewPackName("");
    setNewPackImageUrl("");
    setNewPackQuantity("");

    setIsAdding(false);
  };

  const handleClear = async () => {
    await clearAll();
    setShowClearConfirm(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">📦 Inventory</h2>

      {/* Add New Pack Form */}
      <form
        onSubmit={handleAdd}
        className="p-6 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 space-y-4"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Pack Name
            </label>
            <input
              type="text"
              className="mt-1 block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPackName}
              onChange={(e) => setNewPackName(e.target.value)}
              placeholder="e.g., Modern Horizons 3"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Image URL
            </label>
            <input
              type="text"
              className="mt-1 block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPackImageUrl}
              onChange={(e) => setNewPackImageUrl(e.target.value)}
              placeholder="https://... image.png"
            />
          </div>
          <div className="w-full md:w-24">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Qty
            </label>
            <input
              type="number"
              min={1}
              className="mt-1 block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              // ✅ Bind to string state and add placeholder
              value={newPackQuantity}
              placeholder="1"
              onChange={(e) => setNewPackQuantity(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isAdding}
          className="w-full md:w-auto py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 text-base disabled:bg-gray-500"
        >
          {isAdding ? "Adding..." : "Add Pack"}
        </button>
      </form>

      {/* Pack Grid */}
      {loading && (
        <div className="text-center text-gray-400">Loading packs...</div>
      )}
      {!loading && packs.length === 0 && (
        <div className="text-center text-gray-400 py-10">
          <h3 className="text-xl font-semibold">No packs in your inventory</h3>
          <p>Add some packs using the form above to get started.</p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="bg-gray-800 rounded-xl p-3 flex flex-col items-center text-center shadow-lg border border-gray-700 transition-all hover:scale-105"
          >
            <div className="w-full aspect-[5/7] rounded-md overflow-hidden mb-3">
              <img
                src={pack.imageUrl}
                alt={pack.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://placehold.co/200x280/1F2937/FFF?text=No+Image";
                }}
              />
            </div>
            <h3 className="font-semibold w-full truncate text-white">
              {pack.name}
            </h3>
            <p className="text-lg font-bold text-blue-400">x{pack.quantity}</p>

            <div className="flex gap-2 mt-3 w-full">
              <button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm px-2 py-1 rounded-md font-bold"
                onClick={() =>
                  updatePack({ ...pack, quantity: pack.quantity + 1 })
                }
              >
                +
              </button>
              <button
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-2 py-1 rounded-md font-bold"
                onClick={() =>
                  updatePack({
                    ...pack,
                    quantity: Math.max(0, pack.quantity - 1),
                  })
                }
              >
                -
              </button>
              <button
                className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-sm px-2 py-1 rounded-md"
                onClick={() => deletePack(pack.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {packs.length > 0 && (
        <div className="pt-6 border-t border-gray-700 text-right">
          <button
            className="bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-lg font-semibold"
            onClick={() => setShowClearConfirm(true)}
          >
            Clear All Packs
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-sm w-full">
            <h3 className="text-2xl font-bold text-white">Are you sure?</h3>
            <p className="text-gray-400 mt-2">
              This will permanently delete all packs from your inventory.
            </p>
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}