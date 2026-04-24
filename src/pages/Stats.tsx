import { useState, useMemo } from 'react';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import {
  computePlayerAggregates,
  computeHeadToHead,
  computePlayerDraftHistory,
} from '../utils/playerStats';

export default function Stats() {
  const drafts = useDraftHistoryStore(s => s.drafts);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [h2hNameA, setH2hNameA] = useState('');
  const [h2hNameB, setH2hNameB] = useState('');

  const aggregates = useMemo(() => computePlayerAggregates(drafts), [drafts]);
  const playerNames = aggregates.map(a => a.displayName);

  const expandedHistory = useMemo(
    () => expandedPlayer ? computePlayerDraftHistory(expandedPlayer, drafts) : [],
    [expandedPlayer, drafts]
  );

  const h2hResult = useMemo(() => {
    if (!h2hNameA || !h2hNameB) return null;
    return computeHeadToHead(h2hNameA, h2hNameB, drafts);
  }, [h2hNameA, h2hNameB, drafts]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-white">Stats</h2>

      {/* Leaderboard */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
          <h3 className="text-white font-semibold">Leaderboard</h3>
        </div>
        <div className="grid grid-cols-[24px_1fr_80px_55px_40px_55px] px-4 py-2 bg-gray-800/50 border-b border-gray-700/30 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Record</span>
          <span className="text-right">Win%</span>
          <span className="text-right">GW</span>
          <span className="text-right">Events</span>
        </div>
        {aggregates.length === 0 && (
          <p className="px-4 py-8 text-gray-500 text-sm text-center">No tournament data yet.</p>
        )}
        {aggregates.map((agg, i) => (
          <div key={agg.normalizedName}>
            <button
              onClick={() =>
                setExpandedPlayer(expandedPlayer === agg.normalizedName ? null : agg.normalizedName)
              }
              className="w-full grid grid-cols-[24px_1fr_80px_55px_40px_55px] px-4 py-3 text-sm border-b border-gray-700/30 last:border-0 hover:bg-gray-800/40 text-left transition-colors"
            >
              <span className="text-gray-600 font-bold text-xs self-center">{i + 1}</span>
              <span className="text-gray-200 font-semibold self-center">{agg.displayName}</span>
              <span className="text-gray-400 text-xs text-right self-center">
                {agg.matchTies > 0
                  ? `${agg.matchWins}–${agg.matchLosses}–${agg.matchTies}`
                  : `${agg.matchWins}–${agg.matchLosses}`}
              </span>
              <span className="text-gray-400 text-xs text-right self-center">
                {(agg.matchWinRate * 100).toFixed(0)}%
              </span>
              <span className="text-gray-600 text-xs text-right self-center">{agg.gameWins}</span>
              <span className="text-gray-600 text-xs text-right self-center">{agg.tournamentsPlayed}</span>
            </button>
            {expandedPlayer === agg.normalizedName && (
              <div className="px-4 pb-3 bg-gray-800/20 border-b border-gray-700/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2">
                  Draft History
                </p>
                {expandedHistory.length === 0 ? (
                  <p className="text-gray-600 text-xs italic">No completed matches found.</p>
                ) : (
                  <div className="space-y-1">
                    {expandedHistory.map(dh => (
                      <div
                        key={dh.draftId}
                        className="grid grid-cols-[1fr_70px_40px] text-xs text-gray-400 py-1.5 border-b border-gray-700/20 last:border-0"
                      >
                        <span className="text-gray-500 font-mono text-[10px] self-center">
                          {dh.draftType} · {dh.draftId.slice(0, 8)}
                        </span>
                        <span className="text-right self-center">
                          {dh.matchTies > 0
                            ? `${dh.matchWins}–${dh.matchLosses}–${dh.matchTies}`
                            : `${dh.matchWins}–${dh.matchLosses}`}
                        </span>
                        <span className="text-right text-gray-600 self-center">{dh.gameWins}gw</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Head-to-Head */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
          <h3 className="text-white font-semibold">Head-to-Head</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={h2hNameA}
              onChange={e => { setH2hNameA(e.target.value); if (e.target.value === h2hNameB) setH2hNameB(''); }}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Player A…</option>
              {playerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-gray-500 text-sm font-medium shrink-0">vs</span>
            <select
              value={h2hNameB}
              onChange={e => setH2hNameB(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Player B…</option>
              {playerNames.filter(n => n !== h2hNameA).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {h2hResult && h2hResult.matches.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-2">
              These players haven't faced each other yet.
            </p>
          )}

          {h2hResult && h2hResult.matches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-8 py-4 bg-gray-800/50 rounded-lg">
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{h2hResult.aWins}</p>
                  <p className="text-xs text-gray-400 mt-1">{h2hResult.nameA}</p>
                </div>
                {h2hResult.ties > 0 && (
                  <>
                    <div className="text-gray-600 text-lg font-medium">–</div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">{h2hResult.ties}</p>
                      <p className="text-xs text-gray-400 mt-1">Ties</p>
                    </div>
                  </>
                )}
                <div className="text-gray-600 text-lg font-medium">–</div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{h2hResult.bWins}</p>
                  <p className="text-xs text-gray-400 mt-1">{h2hResult.nameB}</p>
                </div>
              </div>
              <div className="space-y-1">
                {h2hResult.matches.map((m, idx) => (
                  <div
                    key={`${m.draftId}-${idx}`}
                    className="flex items-center text-sm bg-gray-800/50 border border-gray-700/30 rounded-lg px-3 py-2"
                  >
                    <span className={`font-semibold flex-1 ${m.result === 'aWin' ? 'text-white' : 'text-gray-500'}`}>
                      {h2hResult.nameA}
                    </span>
                    <span className="text-gray-600 text-xs font-mono px-3">{m.aGames} – {m.bGames}</span>
                    <span className={`font-semibold flex-1 text-right ${m.result === 'bWin' ? 'text-white' : 'text-gray-500'}`}>
                      {h2hResult.nameB}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
