import { useState } from "react";
// Assuming state is in src/state
import { useInventoryStore } from "../state/inventoryStore";
import { auth } from "../firebase";
import Papa from "papaparse";

export default function Inventory() {
  const { packs, loading, addPack, updatePack, deletePack, clearAll } =
    useInventoryStore();

  const [newPackName, setNewPackName] = useState("");
  const [newPackImageUrl, setNewPackImageUrl] = useState("");
  const [newPackQuantity, setNewPackQuantity] = useState("");

  const [isAdding, setIsAdding] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // --- State for Bulk Import ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackName.trim() || isAdding || !auth.currentUser) return;
    const quantity = Math.max(1, Number(newPackQuantity) || 1);

    setIsAdding(true);
    await addPack({
      name: newPackName,
      imageUrl:
        newPackImageUrl ||
        "https://placehold.co/200x280/1F2937/FFF?text=No+Image",
      quantity: quantity,
    });

    setNewPackName("");
    setNewPackImageUrl("");
    setNewPackQuantity("");
    setIsAdding(false);
  };

  const handleClear = async () => {
    await clearAll();
    setShowClearConfirm(false);
  };

  // --- Handlers for Bulk Import ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    setImportSuccess("");
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleBulkImport = () => {
    if (!importFile) {
      setImportError("Please select a CSV file first.");
      return;
    }

    setIsImporting(true);
    setImportError("");
    setImportSuccess("");

    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // 1. Map to hold merged packs
          const mergedPacks = new Map<
            string,
            { name: string; quantity: number; imageUrl: string }
          >();

          for (const row of results.data as any[]) {
            // 2. Find pack name from common header names
            const packName =
              row["Pack Name"] || row["name"] || row["Name"] || row["Pack"];
            const imageUrl =
              row["Image URL"] || row["imageUrl"] || row["Image"] || row["URL"];
            const quantity =
              row["Quantity"] || row["qty"] || row["Qty"] || row["Count"];

            const parsedQuantity = Number(quantity);

            // 3. Validate and process the row
            if (
              packName &&
              typeof packName === "string" &&
              packName.trim() &&
              imageUrl &&
              typeof imageUrl === "string" &&
              imageUrl.trim() &&
              !isNaN(parsedQuantity) &&
              parsedQuantity > 0
            ) {
              const key = packName.trim().toLowerCase();
              const existing = mergedPacks.get(key);

              if (existing) {
                // 4. Combine duplicates: Sum quantity
                existing.quantity += parsedQuantity;
                // Pick one image URL (last one wins)
                existing.imageUrl = imageUrl;
              } else {
                // 5. Add new unique pack to the map
                mergedPacks.set(key, {
                  name: packName.trim(), // Keep original capitalization
                  quantity: parsedQuantity,
                  imageUrl: imageUrl,
                });
              }
            }
          }

          if (mergedPacks.size === 0) {
            setImportError(
              "No valid packs found. Check headers (e.g., 'Pack Name', 'Image URL', 'Quantity') and ensure all rows have valid data."
            );
            setIsImporting(false);
            return;
          }

          // 6. Create an array of promises to call addPack for each unique pack
          const importPromises = Array.from(mergedPacks.values()).map(
            (pack) =>
              addPack({
                name: pack.name,
                imageUrl: pack.imageUrl,
                quantity: pack.quantity,
              })
          );

          // 7. Run all database transactions
          await Promise.all(importPromises);

          setImportSuccess(
            `Successfully imported ${mergedPacks.size} unique packs.`
          );
        } catch (err) {
          setImportError("An error occurred during import. Check console.");
          console.error(err);
        } finally {
          setIsImporting(false);
          setImportFile(null);
          // Clear the file input
          const fileInput = document.getElementById(
            "csv-upload"
          ) as HTMLInputElement;
          if (fileInput) fileInput.value = "";
        }
      },
      error: (err) => {
        setIsImporting(false);
        setImportError(err.message);
      },
    });
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

      {/* --- Bulk Import Section (MOVED) --- */}
      <div className="p-6 bg-gray-800 rounded-2xl shadow-lg border border-gray-700 space-y-4">
        <h3 className="text-xl font-semibold text-white">Bulk Import</h3>
        <p className="text-gray-400 text-sm">
          Upload a CSV file with columns: "Pack Name", "Image URL", and
          "Quantity".
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="file"
            id="csv-upload"
            accept=".csv"
            onChange={handleFileChange}
            className="flex-1 block w-full text-sm text-gray-400
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-lg file:border-0
                       file:text-sm file:font-semibold
                       file:bg-gray-700 file:text-blue-300
                       hover:file:bg-gray-600"
          />
          <button
            onClick={handleBulkImport}
            disabled={!importFile || isImporting}
            className="py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-green-500/30 text-base disabled:bg-gray-500"
          >
            {isImporting ? "Importing..." : "Upload & Import"}
          </button>
        </div>
        {importError && (
          <p className="text-sm text-red-400 text-center font-medium">
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="text-sm text-green-400 text-center font-medium">
            {importSuccess}
          </p>
        )}
      </div>
      {/* --- End Bulk Import Section --- */}

      {/* --- Clear All Section (MOVED) --- */}
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
      {/* --- End Clear All Section --- */}

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