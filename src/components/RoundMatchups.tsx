import type { DraftPlayer, TournamentPairing } from '../types';

interface RoundMatchupsProps {
  players: DraftPlayer[];
  pairings: TournamentPairing[];
  onStart: () => Promise<void>;
  disabled?: boolean;
}

export default function RoundMatchups({ players, pairings, onStart, disabled = false }: RoundMatchupsProps) {
  const playerMap = new Map(players.map(p => [p.id, p.name]));
  const matchPairings = pairings.filter(p => p.player2Id !== null);
  const byePairing = pairings.find(p => p.player2Id === null);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">⚔️ Round 1</h2>
        <p className="text-gray-400 text-sm mt-1">First round matchups</p>
      </div>

      <div className="space-y-3">
        {matchPairings.map(pairing => (
          <div
            key={pairing.id}
            className="flex items-center gap-3 rounded-xl px-5 py-4 border border-blue-900/40"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #1a1f3e)' }}
          >
            <div className="flex-1 text-right">
              <span className="text-white font-bold text-base">{playerMap.get(pairing.player1Id)}</span>
            </div>
            <div className="bg-purple-700 text-white text-xs font-extrabold px-2 py-1 rounded flex-shrink-0">
              VS
            </div>
            <div className="flex-1 text-left">
              <span className="text-white font-bold text-base">{playerMap.get(pairing.player2Id!)}</span>
            </div>
          </div>
        ))}

        {byePairing && (
          <div className="flex items-center gap-3 rounded-xl px-5 py-3 bg-yellow-900/30 border border-dashed border-yellow-700">
            <span className="text-lg">🎟️</span>
            <span className="text-yellow-200 text-sm font-medium">
              Bye — {playerMap.get(byePairing.player1Id)}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={onStart}
        disabled={disabled}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl text-base"
      >
        {disabled ? 'Saving…' : 'Start Round 1 →'}
      </button>
    </div>
  );
}
