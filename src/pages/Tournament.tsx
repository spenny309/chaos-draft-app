import { useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { useUserStore } from '../state/userStore';
import TournamentView from '../components/TournamentView';
import { draftTitle } from '../utils/draftTitle';
import type { Draft } from '../types';

function formatDraftOption(draft: Draft): string {
  const date = draft.createdAt?.toDate().toLocaleDateString() ?? 'Unknown date';
  const t = draft.tournament!;
  return `${draftTitle(draft)} ${date} — Round ${t.currentRound} of ${t.totalRounds}`;
}

export default function Tournament() {
  const [searchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');
  const { drafts, loading } = useDraftHistoryStore();
  const { profile } = useUserStore();
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <p className="text-gray-400 text-lg">Loading…</p>
      </div>
    );
  }

  const activeDrafts = drafts.filter(d => d.tournament?.status === 'active');

  let selectedDraft: Draft | undefined;

  if (draftIdParam) {
    const found = drafts.find(d => d.id === draftIdParam);
    if (!found || !found.tournament) return <Navigate to="/" />;
    selectedDraft = found;
  } else {
    if (activeDrafts.length === 0) return <Navigate to="/" />;
    selectedDraft = activeDrafts[Math.min(selectedIndex, activeDrafts.length - 1)]!;
  }

  const t = selectedDraft.tournament!;
  const title = draftTitle(selectedDraft);
  const date = selectedDraft.createdAt?.toDate().toLocaleDateString() ?? 'Unknown date';
  const playerNames = selectedDraft.players.map(p => p.name).join(', ');
  const isFinalized = t.status === 'finalized';
  const showDropdown = !draftIdParam && activeDrafts.length >= 2;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {isFinalized ? (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30">
              Finalized
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/40">
              ● Active
            </span>
          )}
          <span className="text-sm text-gray-400">{playerNames}</span>
          <span className="text-sm text-gray-500">·</span>
          <span className="text-sm text-gray-400">{date}</span>
          {!isFinalized && (
            <span className="text-sm text-gray-400">· Round {t.currentRound} of {t.totalRounds}</span>
          )}
        </div>

        {showDropdown && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-500">Tournament:</span>
            <select
              value={selectedIndex}
              onChange={e => setSelectedIndex(Number(e.target.value))}
              className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {activeDrafts.map((d, i) => (
                <option key={d.id} value={i}>{formatDraftOption(d)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <TournamentView
        draft={selectedDraft}
        isAdmin={profile?.role === 'admin'}
        currentUserId={profile?.uid}
      />
    </div>
  );
}
