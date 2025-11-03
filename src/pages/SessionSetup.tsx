import { useState } from "react";
import { useNavigate } from "react-router-dom";
// Assuming state is in src/state
import { useSessionStore } from "../state/sessionStore";
import { useInventoryStore } from "../state/inventoryStore";

export default function SessionSetup() {
  // ✅ Changed numPlayers state to hold a string
  const [numPlayersInput, setNumPlayersInput] = useState("");
  // ✅ State is still initialized with 4 empty strings based on the default
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", "", ""]);
  const navigate = useNavigate();
  const initializeSession = useSessionStore((s) => s.initializeSession);
  const packs = useInventoryStore((s) => s.packs);

  const handlePlayerCountChange = (value: string) => {
    setNumPlayersInput(value); // Update the input field

    // Parse the new count, defaulting to 4 if the input is empty or invalid
    const newCount = Math.max(1, Number(value) || 4);

    // Adjust the playerNames array to match the new count
    const newNames = [...playerNames];
    if (newCount > newNames.length) {
      // Add new players
      for (let i = newNames.length; i < newCount; i++) {
        newNames.push("");
      }
    } else {
      // Remove players
      newNames.length = newCount;
    }
    setPlayerNames(newNames);
  };

  const handlePlayerNameChange = (index: number, name: string) => {
    const newNames = [...playerNames];
    newNames[index] = name;
    setPlayerNames(newNames);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Determine the final number of players from the input string
    const finalNumPlayers = Math.max(1, Number(numPlayersInput) || 4);

    // Use player names, defaulting to "Player X" if empty
    const finalPlayerNames = playerNames.map(
      (name, i) => name.trim() || `Player ${i + 1}`
    );

    initializeSession(finalNumPlayers, finalPlayerNames);
    navigate("/draft");
  };

  // A draft can't start if there are no packs in the inventory
  const canStart = packs.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">⚙️ Session Setup</h2>

      <div className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-8">
        {!canStart ? (
          <div className="text-center text-gray-400">
            <h3 className="text-xl font-semibold text-yellow-400">
              No Packs in Inventory
            </h3>
            <p className="mt-2">
              You must add packs to your inventory before you can start a draft.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Player Count */}
            <div>
              <label className="block text-lg font-medium text-gray-300 mb-2">
                Number of Players
              </label>
              <input
                type="number"
                min={1}
                max={16} // Set a reasonable max
                // ✅ Bind to string state and add placeholder
                value={numPlayersInput}
                placeholder="4"
                onChange={(e) => handlePlayerCountChange(e.target.value)}
                className="mt-1 block w-32 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Player Names */}
            <div>
              <label className="block text-lg font-medium text-gray-300 mb-2">
                Player Names
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {playerNames.map((name, index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Player {index + 1}
                    </label>
                    <input
                      type="text"
                      value={name}
                      placeholder={`Player ${index + 1}`}
                      onChange={(e) =>
                        handlePlayerNameChange(index, e.target.value)
                      }
                      className="mt-1 block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <div className="pt-4">
              <button
                type="submit"
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 text-lg"
              >
                Start Draft
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
