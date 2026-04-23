import { useState } from 'react';
import { shufflePlayers } from '../utils/tournamentPairings';
import type { DraftPlayer } from '../types';

interface SeatAssignmentProps {
  players: DraftPlayer[];
  onConfirm: (orderedPlayers: DraftPlayer[]) => void;
  onBack: () => void;
}

export default function SeatAssignment({ players, onConfirm, onBack }: SeatAssignmentProps) {
  const [ordered, setOrdered] = useState<DraftPlayer[]>(() => shufflePlayers(players));
  const isOdd = ordered.length % 2 !== 0;

  const moveUp = (index: number) => {
    if (index === 0) return;
    setOrdered(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index === ordered.length - 1) return;
    setOrdered(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">Seat Assignment</h2>
      </div>

      <p className="text-gray-400 text-sm">
        Players are randomly seated. Use ▲▼ to reorder.
        {isOdd && <span className="text-yellow-400"> The player at the bottom receives a bye in round 1.</span>}
      </p>

      <div className="space-y-2">
        {ordered.map((player, i) => {
          const isBye = isOdd && i === ordered.length - 1;
          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
                isBye
                  ? 'bg-yellow-900/30 border-dashed border-yellow-700'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                isBye ? 'bg-yellow-800 text-yellow-300' : 'bg-blue-600 text-white'
              }`}>
                {isBye ? 'B' : i + 1}
              </span>
              <span className={`flex-1 font-medium text-sm ${isBye ? 'text-yellow-200' : 'text-white'}`}>
                {player.name}
                {isBye && <span className="text-yellow-400 text-xs ml-2">(Bye)</span>}
              </span>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  className="w-6 h-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-300 rounded text-xs flex items-center justify-center"
                >▲</button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === ordered.length - 1}
                  className="w-6 h-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-gray-300 rounded text-xs flex items-center justify-center"
                >▼</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setOrdered(shufflePlayers(players))}
          className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl"
        >
          🎲 Re-randomize
        </button>
        <button
          onClick={() => onConfirm(ordered)}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
        >
          Confirm Seats →
        </button>
      </div>
    </div>
  );
}
