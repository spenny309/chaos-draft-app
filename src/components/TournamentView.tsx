import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import ScoreEntry from './ScoreEntry';
import { generateSwissPairings, computeStandings } from '../utils/swissPairings';
import { formatArchetype } from '../utils/archetypes';
import type { Draft, DraftPlayer, TournamentPairing } from '../types';

interface TournamentViewProps {
  draft: Draft;
  isAdmin: boolean;
  currentUserId: string | undefined;
}

function playerName(id: string, players: DraftPlayer[]): string {
  return players.find(p => p.id === id)?.name ?? id;
}

function playerArchetype(id: string, players: DraftPlayer[]): string {
  const p = players.find(pl => pl.id === id);
  if (!p) return '';
  return formatArchetype(p.primaryColors ?? [], p.splashColors ?? []);
}

export default function TournamentView({ draft, isAdmin, currentUserId }: TournamentViewProps) {
  const navigate = useNavigate();
  const { submitResult, addRound, finalizeTournament } = useDraftHistoryStore();
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [droppedIds, setDroppedIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [generatingRound, setGeneratingRound] = useState(false);
  const [finalizingTournament, setFinalizingTournament] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tournament, players } = draft;
  if (!tournament) return null;

  const isFinalized = tournament.status === 'finalized';
  const currentRound = isFinalized ? null : tournament.rounds.find(r => r.roundNumber === tournament.currentRound);
  const pastRounds = isFinalized
    ? [...tournament.rounds].sort((a, b) => a.roundNumber - b.roundNumber)
    : tournament.rounds.filter(r => r.roundNumber < tournament.currentRound);

  const hasAnyResult = tournament.rounds.some(r => r.pairings.some(p => p.result != null));
  const standings = (() => {
    const s = computeStandings(players, tournament.rounds);
    if (!hasAnyResult) {
      return s.sort((a, b) => {
        const sa = tournament.seats.find(seat => seat.playerId === a.playerId)?.seat ?? 999;
        const sb = tournament.seats.find(seat => seat.playerId === b.playerId)?.seat ?? 999;
        return sa - sb;
      });
    }
    return s;
  })();

  const nonByePairings = currentRound?.pairings.filter(p => p.player2Id !== null) ?? [];
  const allCurrentComplete = nonByePairings.length > 0 && nonByePairings.every(p => p.status === 'complete');

  const canGenerateNext =
    !pendingOrder &&
    !isFinalized &&
    tournament.currentRound < tournament.totalRounds &&
    (allCurrentComplete || isAdmin);

  const handleGenerateNext = () => {
    try {
      const generated = generateSwissPairings(players, tournament.rounds);
      const order: string[] = [];
      for (const p of generated.filter(p => p.player2Id !== null)) {
        order.push(p.player1Id, p.player2Id!);
      }
      for (const p of generated.filter(p => p.player2Id === null)) {
        order.push(p.player1Id);
      }
      setPendingOrder(order);
      setDroppedIds([]);
    } catch {
      setError('Failed to generate pairings. Please try again.');
    }
  };

  const swapInOrder = (from: number, to: number) => {
    setPendingOrder(prev => {
      if (!prev || from === to) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setDragOver(null);
  };

  const handleConfirmRound = async () => {
    if (!pendingOrder) return;
    const pairings: TournamentPairing[] = [];
    for (let i = 0; i + 1 < pendingOrder.length; i += 2) {
      pairings.push({ id: crypto.randomUUID(), player1Id: pendingOrder[i], player2Id: pendingOrder[i + 1], status: 'pending' });
    }
    if (pendingOrder.length % 2 === 1) {
      pairings.push({ id: crypto.randomUUID(), player1Id: pendingOrder[pendingOrder.length - 1], player2Id: null, status: 'pending' });
    }
    setGeneratingRound(true);
    setError(null);
    try {
      await addRound(draft.id, pairings);
      setPendingOrder(null);
      setDroppedIds([]);
    } catch {
      setError('Failed to save round. Please try again.');
    } finally {
      setGeneratingRound(false);
    }
  };

  const handleFinalize = async () => {
    if (!currentUserId) return;
    if (!window.confirm('Finalize the tournament? This cannot be undone.')) return;
    setFinalizingTournament(true);
    setError(null);
    try {
      await finalizeTournament(draft.id, currentUserId);
      navigate(`/tournament?draft=${draft.id}`, { replace: true });
    } catch {
      setError('Failed to finalize. Please try again.');
    } finally {
      setFinalizingTournament(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">
          Tournament
          {isFinalized
            ? <span className="ml-2 text-xs font-normal text-green-400 bg-green-900/40 px-2 py-0.5 rounded">Finalized</span>
            : <span className="ml-2 text-xs font-normal text-gray-400">Round {tournament.currentRound} of {tournament.totalRounds}</span>
          }
        </h3>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Standings */}
      {standings.length > 0 && (
        <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/50 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Record</span>
            <span className="text-right">GW</span>
          </div>
          {standings.map((s, i) => {
            const arch = playerArchetype(s.playerId, players);
            return (
            <div key={s.playerId} className="grid grid-cols-[24px_1fr_60px_50px] px-4 py-2.5 text-sm border-b border-gray-700/30 last:border-0 items-start">
              <span className="text-gray-600 font-bold text-xs pt-0.5">{i + 1}</span>
              <div>
                <div className="text-gray-200 font-semibold">{playerName(s.playerId, players)}</div>
                {arch && (
                  <div className="text-xs text-gray-600 mt-0.5">{arch}</div>
                )}
              </div>
              <span className="text-gray-400 text-xs text-right pt-0.5">{s.matchTies > 0 ? `${s.matchWins} – ${s.matchLosses} – ${s.matchTies}` : `${s.matchWins} – ${s.matchLosses}`}</span>
              <span className="text-gray-600 text-xs text-right pt-0.5">{s.gameWins}</span>
            </div>
          );
          })}
        </div>
      )}

      {/* Past rounds summary */}
      {pastRounds.map(round => (
        <div key={round.roundNumber} className="space-y-2">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Round {round.roundNumber} — Complete</p>
          {round.pairings.map(pairing => (
            <div key={pairing.id}>
              {pairing.player2Id === null ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-300">
                  🎟️ Bye — {playerName(pairing.player1Id, players)}
                </div>
              ) : (
                <div className="flex items-center text-sm bg-gray-800/50 border border-gray-700/30 rounded-lg px-3 py-2">
                  <span className={`font-semibold flex-1 ${pairing.result?.matchWinner === 'player1' ? 'text-white' : 'text-gray-500'}`}>
                    {playerName(pairing.player1Id, players)}
                  </span>
                  <span className="text-gray-600 text-xs font-mono px-3">
                    {pairing.result ? `${pairing.result.player1Wins} – ${pairing.result.player2Wins}` : '? – ?'}
                  </span>
                  <span className={`font-semibold flex-1 text-right ${pairing.result?.matchWinner === 'player2' ? 'text-white' : 'text-gray-500'}`}>
                    {playerName(pairing.player2Id, players)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Current round */}
      {currentRound && (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">
            Round {currentRound.roundNumber}
            {!isFinalized && <span className="ml-2 text-blue-400">● Active</span>}
          </p>
          {currentRound.pairings.map(pairing => (
            <div key={pairing.id}>
              {pairing.player2Id === null ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-300">
                  🎟️ Bye — {playerName(pairing.player1Id, players)}
                </div>
              ) : (
                <ScoreEntry
                  pairing={pairing}
                  players={players}
                  onSubmit={async result => {
                    await submitResult(draft.id, currentRound.roundNumber, pairing.id, result);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending next round — drag-and-drop matchup editor */}
      {pendingOrder && (() => {
        const matchCount = Math.floor(pendingOrder.length / 2);
        const hasBye = pendingOrder.length % 2 === 1;
        const byeIndex = hasBye ? pendingOrder.length - 1 : -1;

        const chip = (idx: number, byeStyle = false) => (
          <div
            key={idx}
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/plain', `active:${idx}`); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { e.preventDefault(); setDragOver(String(idx)); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => {
              e.preventDefault();
              const source = e.dataTransfer.getData('text/plain');
              if (source.startsWith('active:')) {
                swapInOrder(Number(source.split(':')[1]), idx);
              } else if (source.startsWith('dropped:')) {
                const droppedId = source.slice(8);
                const activeId = pendingOrder[idx];
                setPendingOrder(prev => {
                  if (!prev) return prev;
                  const next = [...prev];
                  next[idx] = droppedId;
                  return next;
                });
                setDroppedIds(prev => prev.filter(id => id !== droppedId).concat(activeId));
                setDragOver(null);
              }
            }}
            onDragEnd={() => setDragOver(null)}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold text-center cursor-grab active:cursor-grabbing select-none transition-colors ${
              dragOver === String(idx)
                ? 'bg-blue-600 border border-blue-400 text-white'
                : byeStyle
                ? 'bg-amber-900/40 border border-amber-700/40 text-amber-200'
                : 'bg-gray-700 border border-gray-600 text-white'
            }`}
          >
            {playerName(pendingOrder[idx], players)}
          </div>
        );

        return (
          <div className="space-y-3 p-4 bg-gray-700/30 rounded-xl border border-gray-600">
            <div>
              <p className="text-white font-medium text-sm">Round {tournament.currentRound + 1}</p>
            </div>
            <div className="space-y-2">
              {Array.from({ length: matchCount }, (_, mi) => (
                <div key={mi} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-2">
                  {chip(mi * 2)}
                  <span className="text-gray-500 text-xs font-medium shrink-0">vs</span>
                  {chip(mi * 2 + 1)}
                </div>
              ))}
              {hasBye && (
                <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">
                  <span className="text-amber-400 text-xs font-semibold shrink-0">Bye</span>
                  {chip(byeIndex, true)}
                </div>
              )}
            </div>

            {/* Sat out / dropped zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver('drop-zone'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault();
                const source = e.dataTransfer.getData('text/plain');
                if (source.startsWith('active:')) {
                  const fromIdx = Number(source.split(':')[1]);
                  const playerId = pendingOrder[fromIdx];
                  setPendingOrder(prev => {
                    if (!prev) return prev;
                    const next = [...prev];
                    next.splice(fromIdx, 1);
                    return next;
                  });
                  setDroppedIds(prev => [...prev, playerId]);
                }
                setDragOver(null);
              }}
              className={`min-h-[44px] rounded-lg border-2 border-dashed px-3 py-2 transition-colors ${
                dragOver === 'drop-zone' ? 'border-red-500 bg-red-900/20' : 'border-gray-600 bg-gray-800/30'
              }`}
            >
              <p className="text-gray-500 text-xs font-semibold mb-1.5">Sat Out</p>
              <div className="flex flex-wrap gap-2">
                {droppedIds.length === 0
                  ? <p className="text-gray-600 text-xs italic">None</p>
                  : droppedIds.map(id => (
                    <div
                      key={id}
                      draggable
                      onClick={() => {
                        setDroppedIds(prev => prev.filter(d => d !== id));
                        setPendingOrder(prev => prev ? [...prev, id] : [id]);
                      }}
                      onDragStart={e => { e.dataTransfer.setData('text/plain', `dropped:${id}`); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => setDragOver(null)}
                      className="px-3 py-1 rounded-md text-sm font-semibold bg-red-900/40 border border-red-700/40 text-red-200 cursor-pointer select-none hover:bg-red-800/50"
                    >
                      {playerName(id, players)}
                    </div>
                  ))
                }
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmRound}
                disabled={generatingRound}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
              >
                {generatingRound ? 'Saving…' : `Confirm Round ${tournament.currentRound + 1} →`}
              </button>
              <button
                onClick={() => { setPendingOrder(null); setDroppedIds([]); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Generate next round button */}
      {canGenerateNext && (
        <button
          onClick={handleGenerateNext}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl"
        >
          Generate Round {tournament.currentRound + 1} →
        </button>
      )}

      {isAdmin && !isFinalized && (
        <button
          onClick={handleFinalize}
          disabled={finalizingTournament}
          className={`w-full py-2.5 disabled:opacity-50 text-sm font-semibold rounded-xl ${
            tournament.currentRound >= tournament.totalRounds && !pendingOrder && allCurrentComplete
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {finalizingTournament ? 'Finalizing…' : 'Finalize Tournament'}
        </button>
      )}
    </div>
  );
}
