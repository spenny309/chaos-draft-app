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
  const [p1Wins, setP1Wins] = useState('');
  const [p2Wins, setP2Wins] = useState('');
  const [ties, setTies] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (pairing.player2Id === null) return null;

  if (pairing.result) {
    const r = pairing.result;
    const isTie = r.matchWinner === 'tie';
    const p1Style = r.matchWinner === 'player1'
      ? 'text-white font-semibold'
      : isTie ? 'text-yellow-400' : 'text-gray-500';
    const p2Style = r.matchWinner === 'player2'
      ? 'text-white font-semibold'
      : isTie ? 'text-yellow-400' : 'text-gray-500';
    return (
      <div className="bg-gray-700/50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className={p1Style}>{playerName(pairing.player1Id, players)}</span>
          <span className={`font-bold ${p1Style}`}>{r.player1Wins}</span>
        </div>
        <div className="flex justify-between">
          <span className={p2Style}>{playerName(pairing.player2Id!, players)}</span>
          <span className={`font-bold ${p2Style}`}>{r.player2Wins}</span>
        </div>
        {r.ties > 0 && <p className="text-gray-500 text-xs">Ties: {r.ties}</p>}
      </div>
    );
  }

  const handleSubmit = async () => {
    const p1 = Math.max(0, parseInt(p1Wins) || 0);
    const p2 = Math.max(0, parseInt(p2Wins) || 0);
    const t = Math.max(0, parseInt(ties) || 0);
    const matchWinner = p1 > p2 ? 'player1' : p2 > p1 ? 'player2' : 'tie';
    setSubmitting(true);
    try {
      await onSubmit({ player1Wins: p1, player2Wins: p2, ties: t, matchWinner, isPartial: false });
    } finally {
      setSubmitting(false);
    }
  };

  const p1Name = playerName(pairing.player1Id, players);
  const p2Name = playerName(pairing.player2Id!, players);
  const inputCls = 'w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white placeholder-gray-500 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  return (
    <div className="bg-gray-700/50 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
        <p className="text-gray-300 truncate" title={p1Name}>{p1Name}</p>
        <p className="text-gray-300 text-sm text-center">Ties</p>
        <p className="text-gray-300 truncate text-right" title={p2Name}>{p2Name}</p>
        <input type="number" min="0" value={p1Wins} placeholder="0" onChange={e => setP1Wins(e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} />
        <input type="number" min="0" value={ties} placeholder="0" onChange={e => setTies(e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} />
        <input type="number" min="0" value={p2Wins} placeholder="0" onChange={e => setP2Wins(e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} />
      </div>
      <div className="flex justify-end">
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
