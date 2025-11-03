import { useState } from "react";
import { useSessionStore } from "../state/sessionStore";

export default function SessionSetup() {
  const { initializeSession } = useSessionStore();
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);

  const handleNumPlayersChange = (n: number) => {
    setNumPlayers(n);
    setPlayerNames(Array(n).fill(""));
  };

  const handleStartSession = () => {
    initializeSession(numPlayers, playerNames);
    alert("Session initialized! Navigate to the Draft page to start selecting packs.");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">🎯 Session Setup</h2>

      <div>
        <label className="block mb-1 font-semibold">Number of Players</label>
        <input
          type="number"
          min={1}
          max={16}
          value={numPlayers}
          onChange={(e) => handleNumPlayersChange(Number(e.target.value))}
          className="w-24 p-2 rounded-md bg-gray-800 border border-gray-700"
        />
      </div>

      <div className="space-y-2">
        {playerNames.map((name, i) => (
          <div key={i}>
            <label className="block text-sm font-semibold mb-1">Player {i + 1} Name</label>
            <input
              type="text"
              className="w-full p-2 rounded-md bg-gray-800 border border-gray-700"
              value={name}
              onChange={(e) =>
                setPlayerNames(playerNames.map((n, idx) => idx === i ? e.target.value : n))
              }
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleStartSession}
        className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md font-semibold"
      >
        Start Session
      </button>
    </div>
  );
}
