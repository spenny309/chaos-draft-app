import { useState } from 'react';
import type { TournamentPairing, DraftPlayer, PairingResult } from '../types';

interface ScoreEntryProps {
  pairing: TournamentPairing;
  players: DraftPlayer[];
  onSubmit: (result: Omit<PairingResult, 'submittedBy' | 'submittedAt'>) => Promise<void>;
}

function playerName(id: string, players: DraftPlayer[]): string {
  return players.find(p => p.id === id)?.name ?? id;
}

export default function ScoreEntry({ pairing, players, onSubmit }: ScoreEntryProps) {
  const [p1Wins, setP1Wins] = useState(0);
  const [p2Wins, setP2Wins] = useState(0);
  const [ties, setTies] = useState(0);
  const [isPartial, setIsPartial] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (pairing.player2Id === null) return null;

  if (pairing.result) {
    const r = pairing.result;
    const winnerName = r.matchWinner === 'player1'
      ? playerName(pairing.player1Id, players)
      : r.matchWinner === 'player2'
      ? playerName(pairing.player2Id!, players)
      : null;
    return (
      <div className="bg-gray-700/50 rounded-lg p-3 text-sm text-gray-300 space-y-1">
        <div className="flex justify-between">
          <span>{playerName(pairing.player1Id, players)}</span>
          <span className="font-bold text-white">{r.player1Wins}</span>
        </div>
        <div className="flex justify-between">
          <span>{playerName(pairing.player2Id!, players)}</span>
          <span className="font-bold text-white">{r.player2Wins}</span>
        </div>
        {r.ties > 0 && <p className="text-gray-400 text-xs">Ties: {r.ties}</p>}
        <p className="text-xs font-semibold mt-1">
          {winnerName ? <span className="text-green-400">{winnerName} wins</span> : <span className="text-yellow-400">Tie match</span>}
          {r.isPartial && <span className="text-orange-400 ml-2">(partial)</span>}
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    const matchWinner = p1Wins > p2Wins ? 'player1' : p2Wins > p1Wins ? 'player2' : 'tie';
    setSubmitting(true);
    try {
      await onSubmit({ player1Wins: p1Wins, player2Wins: p2Wins, ties, matchWinner, isPartial });
    } finally {
      setSubmitting(false);
    }
  };

  const p1Name = playerName(pairing.player1Id, players);
  const p2Name = playerName(pairing.player2Id!, players);

  return (
    <div className="bg-gray-700/50 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
        <p className="text-gray-300 truncate" title={p1Name}>{p1Name}</p>
        <p className="text-gray-300 text-sm text-center">Ties</p>
        <p className="text-gray-300 truncate text-right" title={p2Name}>{p2Name}</p>
        <input
          type="number"
          min="0"
          value={p1Wins || ''}
          placeholder="0"
          onChange={e => setP1Wins(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white placeholder-gray-500 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <input
          type="number"
          min="0"
          value={ties || ''}
          placeholder="0"
          onChange={e => setTies(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white placeholder-gray-500 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <input
          type="number"
          min="0"
          value={p2Wins || ''}
          placeholder="0"
          onChange={e => setP2Wins(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white placeholder-gray-500 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={isPartial}
            onChange={e => setIsPartial(e.target.checked)}
            className="rounded border-gray-500"
          />
          Mark as partial
        </label>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded"
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
