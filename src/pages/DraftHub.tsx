import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegularDraftSetup from './RegularDraftSetup';
import RegularDraftPreview from './RegularDraftPreview';
import SeatAssignment from '../components/SeatAssignment';
import RoundMatchups from '../components/RoundMatchups';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { useSessionStore } from '../state/sessionStore';
import { generateRound1Pairings, playersToSeats } from '../utils/tournamentPairings';
import type {
  PackCatalogEntry,
  DraftFormat,
  DraftPlayer,
  DraftAllocationEntry,
  TournamentPairing,
  DraftTournament,
} from '../types';

type Step = 'setup' | 'preview' | 'seating' | 'matchups' | 'saved';

interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
}

export default function DraftHub() {
  const [step, setStep] = useState<Step>('setup');
  const [config, setConfig] = useState<RegularConfig | null>(null);
  const [chaosPlayers, setChaosPlayers] = useState<DraftPlayer[] | null>(null);
  const [pendingAllocation, setPendingAllocation] = useState<DraftAllocationEntry[] | null>(null);
  const [orderedPlayers, setOrderedPlayers] = useState<DraftPlayer[] | null>(null);
  const [round1Pairings, setRound1Pairings] = useState<TournamentPairing[] | null>(null);
  const [starting, setStarting] = useState(false);

  const navigate = useNavigate();
  const { savePreview, previewAllocations } = useRegularDraftStore();
  const { updateTournament } = useDraftHistoryStore();
  const { initializeSession, setPendingTournament } = useSessionStore();

  const handleStartChaos = (players: DraftPlayer[]) => {
    setChaosPlayers(players);
    setStep('seating');
  };

  const handlePreviewConfirmed = (allocation: DraftAllocationEntry[]) => {
    setPendingAllocation(allocation);
    setStep('seating');
  };

  const handleSeatingConfirmed = (ordered: DraftPlayer[]) => {
    setOrderedPlayers(ordered);
    setRound1Pairings(generateRound1Pairings(ordered));
    setStep('matchups');
  };

  const handleStartRound1 = async () => {
    if (!orderedPlayers || !round1Pairings) return;
    setStarting(true);
    try {
      const seats = playersToSeats(orderedPlayers);
      const tournament: DraftTournament = {
        seats,
        rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
        currentRound: 1,
        totalRounds: 3,
        status: 'active',
      };

      if (chaosPlayers) {
        const names = orderedPlayers.map((p, i) => p.name || `Player ${i + 1}`);
        const userIds = orderedPlayers.map(p => p.userId);
        initializeSession(orderedPlayers.length, names, userIds);
        setPendingTournament(tournament);
        navigate('/draft');
      } else if (config && pendingAllocation) {
        const draftId = await savePreview(config, previewAllocations, pendingAllocation);
        await updateTournament(draftId, tournament);
        setStep('saved');
      }
    } finally {
      setStarting(false);
    }
  };

  const handleStartOver = () => {
    setStep('setup');
    setConfig(null);
    setChaosPlayers(null);
    setPendingAllocation(null);
    setOrderedPlayers(null);
    setRound1Pairings(null);
  };

  const activePlayers = chaosPlayers ?? config?.players ?? [];

  if (step === 'setup') {
    return (
      <RegularDraftSetup
        onNext={(cfg) => { setConfig(cfg); setStep('preview'); }}
        onStartChaos={handleStartChaos}
      />
    );
  }

  if (step === 'preview' && config) {
    return (
      <RegularDraftPreview
        {...config}
        onBack={() => setStep('setup')}
        onConfirmed={handlePreviewConfirmed}
      />
    );
  }

  if (step === 'seating') {
    return (
      <SeatAssignment
        players={activePlayers}
        onConfirm={handleSeatingConfirmed}
        onBack={() => chaosPlayers ? setStep('setup') : setStep('preview')}
      />
    );
  }

  if (step === 'matchups' && orderedPlayers && round1Pairings) {
    return (
      <RoundMatchups
        players={orderedPlayers}
        pairings={round1Pairings}
        onStart={handleStartRound1}
        disabled={starting}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto text-center space-y-4 py-12">
      <div className="text-4xl">✅</div>
      <h2 className="text-xl font-bold text-white">Draft Saved</h2>
      <p className="text-gray-300 text-sm">
        The draft preview has been saved. An admin can finalize it from the History tab,
        which will deduct packs from everyone's private inventories.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => navigate('/history')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
        >
          View in History
        </button>
        <button
          onClick={handleStartOver}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg font-medium"
        >
          New Draft
        </button>
      </div>
    </div>
  );
}
