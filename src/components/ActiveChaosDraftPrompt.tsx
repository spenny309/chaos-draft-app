import type { ActiveChaosDraft } from '../types';

interface Props {
  checkpoint: ActiveChaosDraft;
  busy: boolean;
  error: string | null;
  onResume(): void;
  onDiscard(): Promise<void>;
}

export default function ActiveChaosDraftPrompt({
  checkpoint,
  busy,
  error,
  onResume,
  onDiscard,
}: Props) {
  const discard = async () => {
    if (window.confirm('Discard this unfinished Chaos Draft? Its checkpoint cannot be recovered afterward.')) {
      await onDiscard();
    }
  };

  return (
    <section
      aria-label="Unfinished Chaos Draft"
      className="bg-gray-800 rounded-xl border border-yellow-700 p-5 space-y-3"
    >
      <h2 className="text-xl font-bold text-yellow-300">Unfinished Chaos Draft</h2>
      <p>
        {checkpoint.packsSelectedOrder.length} / {checkpoint.numPacks} packs selected
        {' · '}{checkpoint.players.length} players
      </p>
      <p className="text-sm text-gray-400">
        Last updated {checkpoint.updatedAt.toDate().toLocaleString()}
      </p>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={onResume}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-lg"
        >
          Resume Draft
        </button>
        <button
          disabled={busy}
          onClick={() => void discard()}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white font-semibold rounded-lg"
        >
          Discard Draft
        </button>
      </div>
    </section>
  );
}
