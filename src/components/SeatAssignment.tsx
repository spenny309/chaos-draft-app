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
  const [dragOver, setDragOver] = useState<number | null>(null);
  const isOdd = ordered.length % 2 !== 0;

  const swap = (from: number, to: number) => {
    setOrdered(prev => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setDragOver(null);
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">Seat Assignment</h2>
      </div>

      <p className="text-gray-400 text-sm">
        Players are randomly seated. Drag to reorder.
        {isOdd && <span className="text-yellow-400"> The player at the bottom receives a bye in round 1.</span>}
      </p>

      <div className="space-y-2">
        {ordered.map((player, i) => {
          const isBye = isOdd && i === ordered.length - 1;
          const isTarget = dragOver === i;
          return (
            <div
              key={player.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { e.preventDefault(); setDragOver(i); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); swap(Number(e.dataTransfer.getData('text/plain')), i); }}
              onDragEnd={() => setDragOver(null)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 border cursor-grab active:cursor-grabbing select-none transition-colors ${
                isTarget
                  ? 'bg-blue-900/40 border-blue-500'
                  : isBye
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
