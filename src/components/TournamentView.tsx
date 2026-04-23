import { useState } from 'react';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import ScoreEntry from './ScoreEntry';
import { generateSwissPairings } from '../utils/swissPairings';
import type { Draft, DraftPlayer, TournamentPairing } from '../types';

interface TournamentViewProps {
  draft: Draft;
  isAdmin: boolean;
  currentUserId: string | undefined;
}

function playerName(id: string, players: DraftPlayer[]): string {
  return players.find(p => p.id === id)?.name ?? id;
}

export default function TournamentView({ draft, isAdmin, currentUserId }: TournamentViewProps) {
  const { submitResult, addRound, finalizeTournament } = useDraftHistoryStore();
  const [pendingPairings, setPendingPairings] = useState<TournamentPairing[] | null>(null);
  const [generatingRound, setGeneratingRound] = useState(false);
  const [finalizingTournament, setFinalizingTournament] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tournament, players } = draft;
  if (!tournament) return null;

  const currentRound = tournament.rounds.find(r => r.roundNumber === tournament.currentRound);
  const pastRounds = tournament.rounds.filter(r => r.roundNumber < tournament.currentRound);

  const allCurrentComplete = currentRound
    ? currentRound.pairings.filter(p => p.player2Id !== null).every(p => p.status === 'complete')
    : false;

  const canGenerateNext =
    !pendingPairings &&
    tournament.status !== 'finalized' &&
    tournament.currentRound < tournament.totalRounds &&
    (allCurrentComplete || isAdmin);

  const handleGenerateNext = () => {
    try {
      const completedRounds = tournament.rounds.filter(r => r.status === 'complete');
      const generated = generateSwissPairings(players, completedRounds);
      setPendingPairings(generated);
    } catch {
      setError('Failed to generate pairings. Please try again.');
    }
  };

  const handleConfirmRound = async () => {
    if (!pendingPairings) return;
    setGeneratingRound(true);
    setError(null);
    try {
      await addRound(draft.id, pendingPairings);
      setPendingPairings(null);
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
          {tournament.status === 'finalized'
            ? <span className="ml-2 text-xs font-normal text-green-400 bg-green-900/40 px-2 py-0.5 rounded">Finalized</span>
            : <span className="ml-2 text-xs font-normal text-gray-400">Round {tournament.currentRound} of {tournament.totalRounds}</span>
          }
        </h3>
        {isAdmin && tournament.status !== 'finalized' && (
          <button
            onClick={handleFinalize}
            disabled={finalizingTournament}
            className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg"
          >
            {finalizingTournament ? 'Finalizing…' : 'Finalize Tournament'}
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

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
                <ScoreEntry
                  pairing={pairing}
                  players={players}
                  onSubmit={async result => {
                    await submitResult(draft.id, round.roundNumber, pairing.id, result);
                  }}
                />
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
            {tournament.status !== 'finalized' && <span className="ml-2 text-blue-400">● Active</span>}
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

      {/* Pending next round preview */}
      {pendingPairings && (
        <div className="space-y-3 p-4 bg-gray-700/30 rounded-xl border border-gray-600">
          <p className="text-white font-medium text-sm">Round {tournament.currentRound + 1} — Generated Pairings</p>
          <div className="space-y-2">
            {pendingPairings.map(pairing => (
              <div key={pairing.id} className="flex items-center justify-between text-sm text-gray-300 bg-gray-700/50 rounded-lg px-3 py-2">
                {pairing.player2Id === null ? (
                  <span className="text-amber-300">🎟️ Bye — {playerName(pairing.player1Id, players)}</span>
                ) : (
                  <>
                    <span>{playerName(pairing.player1Id, players)}</span>
                    <span className="text-gray-500 text-xs px-2">vs</span>
                    <span>{playerName(pairing.player2Id, players)}</span>
                  </>
                )}
              </div>
            ))}
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
              onClick={() => setPendingPairings(null)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generate next round button */}
      {canGenerateNext && (
        <button
          onClick={handleGenerateNext}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl"
        >
          Generate Round {tournament.currentRound + 1} →
        </button>
      )}

      {tournament.status !== 'finalized' && tournament.currentRound >= tournament.totalRounds && !pendingPairings && allCurrentComplete && (
        <p className="text-center text-gray-400 text-sm">All rounds complete. Finalize the tournament when ready.</p>
      )}
    </div>
  );
}
