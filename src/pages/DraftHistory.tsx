import { useState, useMemo } from "react";
import { Link } from 'react-router-dom';
import { useDraftHistoryStore } from "../state/draftHistoryStore";
import { useInventoryStore } from "../state/inventoryStore";
import { useUserStore } from "../state/userStore";
import { useRegularDraftStore } from "../state/regularDraftStore";
import { usePrivateInventoryStore } from "../state/privateInventoryStore";
import type { Draft, DraftPackRef, DraftPlayer, MtgColor } from "../types";
import { computeStandings } from '../utils/swissPairings';
import { formatArchetype } from '../utils/archetypes';

const ALL_COLORS: MtgColor[] = ['W', 'U', 'B', 'R', 'G'];

type PipValue = 'off' | 'primary' | 'splash';
type PipState = Record<MtgColor, PipValue>;

const PIP_STYLE: Record<MtgColor, string> = {
  W: 'bg-amber-100 text-amber-900',
  U: 'bg-blue-700 text-blue-100',
  B: 'bg-gray-800 text-gray-400 border border-gray-600',
  R: 'bg-red-700 text-red-100',
  G: 'bg-green-800 text-green-100',
};

function initPipState(player: DraftPlayer): PipState {
  const s = { W: 'off', U: 'off', B: 'off', R: 'off', G: 'off' } as PipState;
  for (const c of player.primaryColors ?? []) s[c] = 'primary';
  for (const c of player.splashColors ?? []) s[c] = 'splash';
  return s;
}

const EMPTY_PIPS: PipState = { W: 'off', U: 'off', B: 'off', R: 'off', G: 'off' };

const typeBadgeColors: Record<string, string> = {
  chaos: 'bg-purple-700 text-purple-200',
  regular: 'bg-blue-700 text-blue-200',
  mobius: 'bg-green-700 text-green-200',
  sealed: 'bg-yellow-700 text-yellow-200',
  'team-sealed': 'bg-orange-700 text-orange-200',
};

const typeBadgeLabels: Record<string, string> = {
  chaos: 'Chaos',
  regular: 'Regular',
  mobius: 'Mobius',
  sealed: 'Sealed',
  'team-sealed': 'Team Sealed',
};

interface PlayersWithArchetypeProps {
  draft: Draft;
  currentUserId: string | undefined;
  isAdmin: boolean;
  setPlayerArchetype: (draftId: string, playerId: string, primary: MtgColor[], splash: MtgColor[]) => Promise<void>;
}

function PlayersWithArchetype({ draft, currentUserId, isAdmin, setPlayerArchetype }: PlayersWithArchetypeProps) {
  const myPlayer = draft.players.find(p => p.userId === currentUserId) ?? null;

  const canEdit = (playerId: string) =>
    isAdmin || myPlayer?.id === playerId;

  const autoOpenPlayer =
    myPlayer && (!myPlayer.primaryColors || myPlayer.primaryColors.length === 0)
      ? myPlayer
      : null;

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(
    autoOpenPlayer?.id ?? null,
  );
  const [pips, setPips] = useState<PipState>(
    autoOpenPlayer ? initPipState(autoOpenPlayer) : EMPTY_PIPS,
  );
  const [saving, setSaving] = useState(false);

  const openEditor = (player: DraftPlayer) => {
    setPips(initPipState(player));
    setEditingPlayerId(player.id);
  };

  const handleChipClick = (player: DraftPlayer) => {
    if (!canEdit(player.id)) return;
    if (editingPlayerId === player.id) {
      setEditingPlayerId(null);
    } else {
      openEditor(player);
    }
  };

  const cyclePip = (color: MtgColor) => {
    setPips(prev => {
      const cur = prev[color];
      const next: PipValue = cur === 'off' ? 'primary' : cur === 'primary' ? 'splash' : 'off';
      return { ...prev, [color]: next };
    });
  };

  const handleSave = async (playerId: string) => {
    setSaving(true);
    const primary = ALL_COLORS.filter(c => pips[c] === 'primary');
    const splash = ALL_COLORS.filter(c => pips[c] === 'splash');
    await setPlayerArchetype(draft.id, playerId, primary, splash);
    setSaving(false);
    setEditingPlayerId(null);
  };

  const editingPlayer = editingPlayerId
    ? (draft.players.find(p => p.id === editingPlayerId) ?? null)
    : null;

  const previewArch = editingPlayer
    ? formatArchetype(
        ALL_COLORS.filter(c => pips[c] === 'primary'),
        ALL_COLORS.filter(c => pips[c] === 'splash'),
      )
    : '';

  return (
    <div className="mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
        Players
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {draft.players.map(player => {
          const arch = formatArchetype(player.primaryColors ?? [], player.splashColors ?? []);
          const editable = canEdit(player.id);
          const isEditing = editingPlayerId === player.id;
          return (
            <button
              key={player.id}
              onClick={() => handleChipClick(player)}
              disabled={!editable}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors
                ${editable ? 'cursor-pointer' : 'cursor-default'}
                ${isEditing
                  ? 'bg-gray-800 border-blue-700 text-gray-200'
                  : editable
                    ? 'bg-gray-800 border-blue-900 text-gray-300 hover:border-blue-700'
                    : 'bg-gray-800 border-gray-700 text-gray-300'
                }`}
            >
              <span>{player.name}</span>
              {arch && (
                <>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-400 text-xs">{arch}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {editingPlayer && (
        <div className="mt-3 bg-gray-900/60 border border-gray-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-sm w-20 shrink-0">{editingPlayer.name}</span>
            <div className="flex gap-1.5">
              {ALL_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => cyclePip(color)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${PIP_STYLE[color]}
                    ${pips[color] === 'off' ? 'opacity-25' : ''}
                    ${pips[color] === 'primary' ? 'ring-2 ring-offset-1 ring-offset-gray-900 ring-blue-400' : ''}
                    ${pips[color] === 'splash' ? 'ring-2 ring-offset-1 ring-offset-gray-900 ring-purple-500 opacity-75' : ''}
                  `}
                >
                  {color}
                </button>
              ))}
            </div>
            {previewArch && (
              <span className="text-gray-500 text-xs ml-1">{previewArch}</span>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleSave(editingPlayer.id)}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditingPlayerId(null)}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RestockAlertProps {
  draft: Draft;
  inventoryMap: Map<string, number>;
  inventoryLoading: boolean;
  markRestockComplete: (id: string) => Promise<void>;
}

function RestockAlert({ draft, inventoryMap, inventoryLoading, markRestockComplete }: RestockAlertProps) {
  const [selectedPack, setSelectedPack] = useState<DraftPackRef | null>(null);

  const packsToRestock = useMemo(() => {
    if (draft.restockComplete || inventoryLoading) return [];
    if (draft.type !== 'chaos' || !draft.packsSelectedOrder) return [];

    const uniquePacks: Map<string, DraftPackRef> = new Map();

    for (const pack of draft.packsSelectedOrder) {
      const inventoryCount = inventoryMap.get(pack.id) || 0;
      if (inventoryCount > 0) {
        uniquePacks.set(pack.id, pack);
      }
    }

    const packArray = Array.from(uniquePacks.values());
    packArray.sort((a, b) => a.name.localeCompare(b.name));
    return packArray;
  }, [draft, inventoryMap, inventoryLoading]);

  if (draft.type !== 'chaos') return null;

  if (draft.restockComplete) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-700/50">
        <div className="p-4 rounded-lg bg-green-800/50 border border-green-600 text-center">
          <span className="font-semibold text-green-300">
            ✅ Restock Complete
          </span>
        </div>
      </div>
    );
  }

  if (packsToRestock.length === 0 && !inventoryLoading) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-700/50">
        <div className="p-4 rounded-lg bg-gray-700/50 text-center">
          <span className="font-semibold text-gray-400">
            No Restock Needed
          </span>
        </div>
      </div>
    );
  }

  if (packsToRestock.length > 0) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-4">
        <div className="p-6 rounded-2xl bg-yellow-900/40 border-2 border-yellow-600/70">
          <h4 className="text-xl font-bold text-yellow-300 mb-4">
            ⚠️ Physical Pool Restock Needed
          </h4>
          <p className="text-yellow-200/80 mb-5">
            You drafted the following packs and have more in your inventory.
            Please add one of each to your physical draft box.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            {packsToRestock.map((pack) => (
              <div key={pack.id} className="flex flex-col items-center gap-2">
                <button
                  onClick={() => setSelectedPack(pack)}
                  className="focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded-md"
                >
                  <img
                    src={pack.imageUrl}
                    alt={pack.name}
                    title={pack.name}
                    className="w-20 h-28 rounded-md object-cover border-2 border-yellow-600"
                  />
                </button>
                <span className="text-xs text-yellow-200/90 w-20 text-center truncate">
                  {pack.name}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => markRestockComplete(draft.id)}
            className="w-full py-3 px-5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg"
          >
            Mark Restock as Complete
          </button>
        </div>
        {selectedPack && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-in fade-in duration-300"
            onClick={() => setSelectedPack(null)}
          >
            <div
              className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-2 border-gray-700 max-w-md animate-in slide-in-from-bottom-4 duration-500"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-64 h-80 rounded-lg overflow-hidden shadow-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-gray-900">
                  <img
                    src={selectedPack.imageUrl}
                    alt={selectedPack.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-2xl font-bold text-blue-300 text-center">
                  {selectedPack.name}
                </h3>
                <button
                  onClick={() => setSelectedPack(null)}
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transition-all hover:scale-105"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

interface LinkPlayersSectionProps {
  draft: Draft;
  publicProfiles: { uid: string; name: string }[];
  linkDraftPlayers: (draftId: string, players: DraftPlayer[]) => Promise<void>;
}

function LinkPlayersSection({ draft, publicProfiles, linkDraftPlayers }: LinkPlayersSectionProps) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Record<string, string | null>>(
    () => Object.fromEntries(draft.players.map(p => [p.id, p.userId]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = draft.players.some(p => links[p.id] !== p.userId);

  const handleSave = async () => {
    setSaving(true);
    const updated = draft.players.map(p => ({ ...p, userId: links[p.id] ?? null }));
    await linkDraftPlayers(draft.id, updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/50">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 font-semibold uppercase tracking-wide"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Link Players to Accounts
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {draft.players.map(player => (
            <div key={player.id} className="flex items-center gap-3">
              <span className="text-gray-300 text-sm w-28 truncate">{player.name}</span>
              <select
                value={links[player.id] ?? ''}
                onChange={e => setLinks(prev => ({ ...prev, [player.id]: e.target.value || null }))}
                className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Unlinked —</option>
                {publicProfiles.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Links'}
          </button>
        </div>
      )}
    </div>
  );
}

function TournamentWidget({ draft }: { draft: Draft }) {
  const t = draft.tournament!;
  const isFinalized = t.status === 'finalized';

  let winnerName: string | null = null;
  if (isFinalized) {
    const standings = computeStandings(draft.players, t.rounds);
    winnerName = draft.players.find(p => p.id === standings[0]?.playerId)?.name ?? null;
  }

  const matchesComplete = t.rounds
    .flatMap(r => r.pairings)
    .filter(p => p.status === 'complete' && p.player2Id !== null).length;

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/50">
      <div className={`flex items-center gap-4 bg-gray-900/60 border rounded-xl p-4 ${
        isFinalized ? 'border-green-700/30' : 'border-blue-700/30'
      }`}>
        <span className="text-xl">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-200">
              {isFinalized ? 'Tournament complete' : 'Tournament in progress'}
            </span>
            {isFinalized ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30">
                Finalized
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-400 border border-blue-700/40">
                Round {t.currentRound} of {t.totalRounds}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {isFinalized && winnerName
              ? `Winner: ${winnerName}`
              : `${matchesComplete} matches complete`
            }
          </p>
        </div>
        <Link
          to={`/tournament?draft=${draft.id}`}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            isFinalized
              ? 'bg-green-900/20 text-green-400 border-green-700/30 hover:bg-green-900/40'
              : 'bg-blue-900/40 text-blue-300 border-blue-700/30 hover:bg-blue-900/60'
          }`}
        >
          {isFinalized ? 'View Results →' : 'View Tournament →'}
        </Link>
      </div>
    </div>
  );
}

export default function DraftHistory() {
  const { drafts, loading, error, deleteDraft, markRestockComplete, loadDrafts, linkDraftPlayers, setPlayerArchetype } =
    useDraftHistoryStore();

  const { packs: inventoryPacks, loading: inventoryLoading } =
    useInventoryStore();

  const { profile, publicProfiles, loadPublicProfiles } = useUserStore();
  const { finalizeDraft } = useRegularDraftStore();
  const { batchDeduct } = usePrivateInventoryStore();

  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<DraftPackRef | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const inventoryMap = useMemo(() => {
    if (inventoryLoading) return new Map<string, number>();
    return new Map(inventoryPacks.map((p) => [p.id, p.inPerson]));
  }, [inventoryPacks, inventoryLoading]);

  const filtered = typeFilter === 'all'
    ? drafts
    : drafts.filter(d => d.type === typeFilter);

  const toggleExpand = (draftId: string) => {
    setExpandedDraftId((prevId) => (prevId === draftId ? null : draftId));
    if (profile?.role === 'admin' && publicProfiles.length === 0) loadPublicProfiles();
  };

  const handleDelete = (draft: Draft) => {
    let message = "Are you sure you want to delete this draft?";
    if (draft.type === 'chaos') {
      message = "Are you sure you want to delete this draft?\nAll packs from this draft will be added back to the 'Available' inventory.";
    } else if (draft.status === 'finalized' && draft.allocation?.length) {
      message = "Are you sure you want to delete this draft?\nAll deducted packs will be returned to each player's private inventory.";
    }
    if (!window.confirm(message)) return;
    deleteDraft(draft.id);
  };

  const handleFinalize = async (draft: Draft) => {
    if (!draft.allocation) return;
    setFinalizing(draft.id);
    try {
      await batchDeduct(draft.allocation);
      await finalizeDraft(draft.id, draft.allocation);
      await loadDrafts();
    } finally {
      setFinalizing(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8">📜 Draft History</h2>
        <div className="text-center text-gray-400">Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8">📜 Draft History</h2>
        <div className="text-center text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">📜 Draft History</h2>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-gray-400 text-sm">Filter:</label>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
        >
          <option value="all">All Drafts</option>
          <option value="chaos">Chaos</option>
          <option value="regular">Regular</option>
          <option value="mobius">Mobius</option>
          <option value="sealed">Sealed</option>
          <option value="team-sealed">Team Sealed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-10 bg-gray-800 rounded-2xl">
          <h3 className="text-xl font-semibold">No Drafts Found</h3>
          <p>Complete a draft to see its history here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((draft) => {
            let playerNames = "No players";
            const names = draft.players.map((p) => p.name);

            if (names.length === 1) {
              playerNames = names[0];
            } else if (names.length === 2) {
              playerNames = names.join(" and ");
            } else if (names.length > 2) {
              const allButLast = names.slice(0, -1).join(", ");
              const lastName = names[names.length - 1];
              playerNames = `${allButLast}, and ${lastName}`;
            }

            return (
              <div
                key={draft.id}
                className="bg-gray-800 rounded-2xl shadow-lg border border-gray-700 p-6 transition-all duration-300"
              >
                <button
                  onClick={() => toggleExpand(draft.id)}
                  className="w-full flex justify-between items-center text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {draft.type === 'chaos' && !draft.restockComplete && !inventoryLoading && (
                      <div
                        className="w-3 h-3 bg-yellow-400 rounded-full flex-shrink-0"
                        title="Restock Needed"
                      ></div>
                    )}
                    <h3 className="text-xl font-bold text-blue-400 truncate">
                      {draft.type.charAt(0).toUpperCase() + draft.type.slice(1)} Draft on{" "}
                      {draft.createdAt?.toDate().toLocaleDateString() ||
                        "Unknown Date"}{" "}
                      with {playerNames}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${typeBadgeColors[draft.type] ?? 'bg-gray-700 text-gray-300'}`}>
                      {typeBadgeLabels[draft.type] ?? draft.type}
                    </span>
                    {draft.status === 'preview' && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-800 text-yellow-200 flex-shrink-0">Preview</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-6 w-6 text-gray-400 transition-transform duration-300 ${
                        expandedDraftId === draft.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {expandedDraftId === draft.id && (
                  <div className="mt-6 pt-6 border-t border-gray-700 animate-in fade-in duration-500">
                    <PlayersWithArchetype
                      draft={draft}
                      currentUserId={profile?.uid}
                      isAdmin={profile?.role === 'admin'}
                      setPlayerArchetype={setPlayerArchetype}
                    />

                    {draft.tournament && (
                      <TournamentWidget draft={draft} />
                    )}

                    {draft.type === 'chaos' && draft.packsSelectedOrder && (() => {
                      const numPlayers = draft.players.length;
                      const byPlayer = draft.players.map((player, pi) => ({
                        player,
                        packs: draft.packsSelectedOrder!.filter((_, i) => i % numPlayers === pi),
                      }));
                      return (
                        <div className="mb-4">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-2">
                            Packs Drafted
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {byPlayer.map(({ player, packs }) => (
                              <div key={player.id}>
                                <p className="text-xs font-semibold text-gray-400 mb-2 truncate">{player.name}</p>
                                <div className="flex flex-wrap gap-2">
                                  {packs.map((pack, idx) => (
                                    <button
                                      key={`${pack.id}-${idx}`}
                                      onClick={() => setSelectedPack(pack)}
                                      className="focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-md"
                                    >
                                      <img
                                        src={pack.imageUrl}
                                        alt={pack.name}
                                        title={pack.name}
                                        className="w-20 h-28 rounded-md object-cover border-2 border-gray-600 transition-all hover:border-blue-400"
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {draft.type !== 'chaos' && draft.sets && (
                      <div className="space-y-2 mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Sets</p>
                        {draft.sets.map(s => (
                          <div key={s.catalogId} className="flex items-center gap-2 text-sm text-gray-300">
                            <img src={s.imageUrl} alt={s.name} className="w-5 h-6 object-cover rounded" />
                            <span>{s.name}</span>
                            <span className="text-gray-500">({s.totalNeeded} packs)</span>
                          </div>
                        ))}
                        {draft.allocation && draft.allocation.length > 0 && (
                          <div className="mt-3">
                            <p className="text-gray-400 text-sm font-medium mb-1">Allocation:</p>
                            {draft.allocation.map((a, i) => (
                              <div key={i} className="flex justify-between text-xs text-gray-300">
                                <span>{a.userName} — {a.name}</span>
                                <span className="font-semibold">{a.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!inventoryLoading && (
                      <RestockAlert
                        draft={draft}
                        inventoryMap={inventoryMap}
                        inventoryLoading={inventoryLoading}
                        markRestockComplete={markRestockComplete}
                      />
                    )}

                    {profile?.role === 'admin' && draft.status === 'preview' && draft.type !== 'chaos' && (
                      <button
                        onClick={() => handleFinalize(draft)}
                        disabled={finalizing === draft.id}
                        className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
                      >
                        {finalizing === draft.id ? 'Finalizing…' : 'Finalize Draft'}
                      </button>
                    )}

                    {profile?.role === 'admin' && (
                      <LinkPlayersSection
                        draft={draft}
                        publicProfiles={publicProfiles}
                        linkDraftPlayers={linkDraftPlayers}
                      />
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-700/50 text-right">
                      <button
                        onClick={() => handleDelete(draft)}
                        className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 transition-colors"
                      >
                        Delete Draft{(draft.type === 'chaos' || (draft.status === 'finalized' && draft.allocation?.length)) ? ' & Revert Inventory' : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedPack && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-in fade-in duration-300"
          onClick={() => setSelectedPack(null)}
        >
          <div
            className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-2 border-gray-700 max-w-md animate-in slide-in-from-bottom-4 duration-500"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-6">
              <div className="w-64 h-80 rounded-lg overflow-hidden shadow-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-gray-900">
                <img
                  src={selectedPack.imageUrl}
                  alt={selectedPack.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <h3 className="text-2xl font-bold text-blue-300 text-center">
                {selectedPack.name}
              </h3>
              <button
                onClick={() => setSelectedPack(null)}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transition-all hover:scale-105"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
