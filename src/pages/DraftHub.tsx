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

type Step = 'setup' | 'preview' | 'seating' | 'matchups';

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
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    try {
      if (chaosPlayers) {
        const names = orderedPlayers.map((p, i) => p.name || `Player ${i + 1}`);
        const userIds = orderedPlayers.map(p => p.userId);

        // initializeSession assigns IDs player-1..N in seat order.
        // Remap to those same IDs now so tournament data stays consistent with saved players.
        const remapped = orderedPlayers.map((p, i) => ({ ...p, id: `player-${i + 1}` }));
        const tournament: DraftTournament = {
          seats: playersToSeats(remapped),
          rounds: [{ roundNumber: 1, pairings: generateRound1Pairings(remapped), status: 'active' }],
          currentRound: 1,
          totalRounds: 3,
          status: 'active',
        };

        initializeSession(orderedPlayers.length, names, userIds);
        setPendingTournament(tournament);
        setStarting(false);
        navigate('/draft');
      } else if (config && pendingAllocation) {
        const tournament: DraftTournament = {
          seats: playersToSeats(orderedPlayers),
          rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
          currentRound: 1,
          totalRounds: 3,
          status: 'active',
        };
        const draftId = await savePreview(config, previewAllocations, pendingAllocation);
        await updateTournament(draftId, tournament);
        navigate('/tournament');
      }
    } catch (err) {
      console.error('Failed to start round 1:', err);
      setSaveError('Failed to save. Please try again.');
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
      <div>
        {saveError && (
          <p className="text-red-400 text-sm text-center mb-3">{saveError}</p>
        )}
        <RoundMatchups
          players={orderedPlayers}
          pairings={round1Pairings}
          onStart={handleStartRound1}
          disabled={starting}
        />
      </div>
    );
  }

  return null;
}
