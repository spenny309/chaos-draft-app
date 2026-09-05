import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import RegularDraftSetup from './RegularDraftSetup';
import RegularDraftPreview from './RegularDraftPreview';
import ActiveChaosDraftPrompt from '../components/ActiveChaosDraftPrompt';
import SeatAssignment from '../components/SeatAssignment';
import RoundMatchups from '../components/RoundMatchups';
import { activeChaosDraftRepository } from '../repositories/activeChaosDraftRepository';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { useSessionStore } from '../state/sessionStore';
import { useUserStore } from '../state/userStore';
import { shouldDiscoverChaosCheckpoint } from '../utils/chaosDraftAccess';
import { generateRound1Pairings, playersToSeats } from '../utils/tournamentPairings';
import type {
  PackCatalogEntry,
  DraftFormat,
  DraftPlayer,
  DraftAllocationEntry,
  TournamentPairing,
  DraftTournament,
  ActiveChaosDraft,
} from '../types';

type Step = 'setup' | 'preview' | 'seating' | 'matchups';
type ChaosDiscovery = 'unavailable' | 'loading' | 'ready' | 'error';

interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
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
  const [checkpoint, setCheckpoint] = useState<ActiveChaosDraft | null>(null);
  const [chaosDiscovery, setChaosDiscovery] = useState<ChaosDiscovery>('unavailable');
  const [chaosDiscoveryOwnerId, setChaosDiscoveryOwnerId] = useState<string | null>(null);
  const [chaosUnavailableError, setChaosUnavailableError] = useState<string | null>(null);
  const [checkpointActionError, setCheckpointActionError] = useState<string | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const chaosOperationGeneration = useRef(0);

  const navigate = useNavigate();
  const profile = useUserStore(s => s.profile);
  const { savePreview, previewAllocations } = useRegularDraftStore();
  const { updateTournament, loadDrafts } = useDraftHistoryStore();
  const { initializeSession, hydrateSession, discardSession, clearLocalSession } = useSessionStore();

  const isAdmin = shouldDiscoverChaosCheckpoint(profile);
  const profileUid = profile?.uid ?? null;
  const discoveryMatchesProfile = isAdmin && chaosDiscoveryOwnerId === profileUid;
  const activeCheckpoint = discoveryMatchesProfile ? checkpoint : null;
  const canStartChaos = discoveryMatchesProfile && chaosDiscovery === 'ready' && activeCheckpoint === null;

  const approvedOwnerIsCurrent = (ownerId: string) => {
    const currentProfile = useUserStore.getState().profile;
    return (
      auth.currentUser?.uid === ownerId &&
      currentProfile?.uid === ownerId &&
      shouldDiscoverChaosCheckpoint(currentProfile)
    );
  };

  useEffect(() => {
    let current = true;
    chaosOperationGeneration.current += 1;
    setCheckpoint(null);
    setChaosUnavailableError(null);
    setCheckpointActionError(null);
    setCheckpointBusy(false);
    setStarting(false);
    setChaosPlayers(null);
    setStep('setup');

    if (!profileUid || !isAdmin) {
      setChaosDiscoveryOwnerId(null);
      setChaosDiscovery('unavailable');
      return () => { current = false; };
    }

    const ownerId = profileUid;
    setChaosDiscoveryOwnerId(ownerId);
    setChaosDiscovery('loading');
    void activeChaosDraftRepository.get(ownerId).then(
      (activeCheckpoint) => {
        if (!current) return;
        setCheckpoint(activeCheckpoint);
        setChaosDiscovery('ready');
      },
      (error) => {
        if (!current) return;
        console.error('Failed to discover active Chaos Draft:', error);
        setChaosUnavailableError('Chaos Draft is temporarily unavailable. Retry by reloading this page.');
        setChaosDiscovery('error');
      },
    );

    return () => {
      current = false;
      chaosOperationGeneration.current += 1;
    };
  }, [isAdmin, profileUid]);

  const handleStartChaos = (players: DraftPlayer[]) => {
    if (!canStartChaos) return;
    setChaosPlayers(players);
    setSaveError(null);
    setStep('seating');
  };

  const handleResumeChaos = () => {
    if (
      !activeCheckpoint ||
      checkpointBusy ||
      !isAdmin ||
      !approvedOwnerIsCurrent(activeCheckpoint.ownerId)
    ) return;
    setCheckpointActionError(null);
    try {
      hydrateSession(activeCheckpoint);
      navigate('/draft');
    } catch (error) {
      console.error('Failed to resume active Chaos Draft:', error);
      setCheckpointActionError('This checkpoint could not be resumed. You may discard it or try again.');
    }
  };

  const handleDiscardChaos = async () => {
    if (
      !activeCheckpoint ||
      checkpointBusy ||
      !isAdmin ||
      !approvedOwnerIsCurrent(activeCheckpoint.ownerId)
    ) return;
    const checkpointToDiscard = activeCheckpoint;
    const operationGeneration = ++chaosOperationGeneration.current;
    const operationIsCurrent = () => (
      chaosOperationGeneration.current === operationGeneration &&
      approvedOwnerIsCurrent(checkpointToDiscard.ownerId)
    );
    setCheckpointBusy(true);
    setCheckpointActionError(null);
    try {
      const session = useSessionStore.getState();
      if (
        session.ownerId === checkpointToDiscard.ownerId &&
        session.sessionId === checkpointToDiscard.sessionId &&
        session.revision === checkpointToDiscard.revision
      ) {
        await discardSession();
      } else {
        await activeChaosDraftRepository.discard({
          ownerId: checkpointToDiscard.ownerId,
          sessionId: checkpointToDiscard.sessionId,
          expectedRevision: checkpointToDiscard.revision,
        });
        if (!operationIsCurrent()) return;
        clearLocalSession();
      }

      if (!operationIsCurrent()) return;
      setCheckpoint(null);
      setChaosDiscovery('ready');
    } catch (error) {
      if (!operationIsCurrent()) return;
      console.error('Failed to discard active Chaos Draft:', error);
      setCheckpointActionError('The checkpoint was not discarded. Refresh its status and try again.');
    } finally {
      if (operationIsCurrent()) setCheckpointBusy(false);
    }
  };

  const handlePreviewConfirmed = (allocation: DraftAllocationEntry[]) => {
    setPendingAllocation(allocation);
    setStep('seating');
  };

  const handleSeatingConfirmed = async (ordered: DraftPlayer[]) => {
    setOrderedPlayers(ordered);
    if (chaosPlayers) {
      const ownerId = profileUid;
      if (!ownerId || !canStartChaos || starting || !approvedOwnerIsCurrent(ownerId)) return;
      const operationGeneration = ++chaosOperationGeneration.current;
      const operationIsCurrent = () => (
        chaosOperationGeneration.current === operationGeneration &&
        approvedOwnerIsCurrent(ownerId)
      );
      setStarting(true);
      setSaveError(null);
      try {
        await initializeSession(ordered, ordered.length * 3);
        if (!operationIsCurrent()) return;
        navigate('/draft');
      } catch (error) {
        if (!operationIsCurrent()) return;
        console.error('Failed to start Chaos Draft:', error);
        setSaveError('Failed to create the Chaos Draft checkpoint. Please try again.');
      } finally {
        if (operationIsCurrent()) setStarting(false);
      }
    } else {
      setRound1Pairings(generateRound1Pairings(ordered));
      setStep('matchups');
    }
  };

  const handleStartRound1 = async () => {
    if (!orderedPlayers || !round1Pairings || !config) return;
    if (!config.cubeId && !pendingAllocation) return;
    setStarting(true);
    setSaveError(null);
    try {
      const tournament: DraftTournament = {
        seats: playersToSeats(orderedPlayers),
        rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
        currentRound: 1,
        totalRounds: 3,
        status: 'active',
      };
      const draftId = await savePreview(config, previewAllocations, pendingAllocation ?? []);
      await updateTournament(draftId, tournament);
      await loadDrafts();
      navigate('/tournament');
    } catch (err) {
      console.error('Failed to start round 1:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const activePlayers = chaosPlayers ?? config?.players ?? [];

  if (step === 'setup') {
    return (
      <div className="space-y-6">
        {activeCheckpoint && (
          <ActiveChaosDraftPrompt
            checkpoint={activeCheckpoint}
            busy={checkpointBusy}
            error={checkpointActionError}
            onResume={handleResumeChaos}
            onDiscard={handleDiscardChaos}
          />
        )}
        {discoveryMatchesProfile && chaosUnavailableError && (
          <p role="alert" className="text-red-400 text-sm text-center">{chaosUnavailableError}</p>
        )}
        <RegularDraftSetup
          isApprovedAdmin={isAdmin}
          canStartChaos={canStartChaos}
          onNext={(cfg) => {
            setChaosPlayers(null);
            setConfig(cfg);
            setStep(cfg.cubeId ? 'seating' : 'preview');
          }}
          onStartChaos={handleStartChaos}
        />
      </div>
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
      <div>
        {saveError && (
          <p role="alert" className="text-red-400 text-sm text-center mb-3">{saveError}</p>
        )}
        {starting && (
          <p className="text-gray-400 text-sm text-center mb-3">Creating Chaos Draft checkpoint…</p>
        )}
        <SeatAssignment
          players={activePlayers}
          onConfirm={handleSeatingConfirmed}
          onBack={() => {
            if (chaosPlayers) {
              setChaosPlayers(null);
              setStep('setup');
            } else {
              setStep(config?.cubeId ? 'setup' : 'preview');
            }
          }}
        />
      </div>
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
