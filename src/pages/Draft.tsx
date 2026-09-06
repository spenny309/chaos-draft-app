import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useSessionStore } from "../state/sessionStore";
import { useInventoryStore, type Pack } from "../state/inventoryStore";
import { useDraftHistoryStore } from "../state/draftHistoryStore";
import { useUserStore } from '../state/userStore';
import {
  activeChaosDraftRepository,
  ChaosDraftConflictError,
  ChaosDraftValidationError,
} from '../repositories/activeChaosDraftRepository';
import RoundMatchups from "../components/RoundMatchups";
import { generateRound1Pairings, playersToSeats } from "../utils/tournamentPairings";
import {
  createSpinCheckpointCoordinator,
  type SpinCheckpointState,
} from '../utils/spinCheckpointCoordinator';
import { shouldDiscoverChaosCheckpoint } from '../utils/chaosDraftAccess';
import type { DraftTournament } from "../types";

import tickSoundFile from "../assets/tick.mp3";
import selectedSoundFile from "../assets/selected.mp3";

// --- REFACTOR HELPER FUNCTIONS ---

/**
 * Optionally trims the buffer if it's getting too large.
 * @returns A new, smaller buffer and the pixel adjustment needed for the offset.
 */
const trimBuffer = ({
  buffer,
  offset,
  visibleWidth,
  packTotalWidth,
  packWidth,
  packGap,
  bufferPadding,
}: {
  buffer: Pack[];
  offset: number;
  visibleWidth: number;
  packTotalWidth: number;
  packWidth: number;
  packGap: number;
  bufferPadding: number;
}) => {
  if (buffer.length <= 150) {
    return { trimmedBuffer: buffer, offsetAdjustment: 0 };
  }

  const currentPackIndex = Math.round(offset / packTotalWidth);
  const packsInViewport = Math.ceil(visibleWidth / packTotalWidth) + 2;
  const startKeep = Math.max(0, currentPackIndex - bufferPadding);
  const endKeep = currentPackIndex + packsInViewport + bufferPadding;

  const trimmedBuffer = buffer.slice(startKeep, endKeep);
  const offsetAdjustment = startKeep * packWidth + startKeep * packGap;

  return { trimmedBuffer, offsetAdjustment };
};

/**
 * Creates the list of packs that will be spun through during the animation.
 * @returns The list of packs to append, the number of packs in the "revolution" part,
 * and the shuffled list used to create it (for the fallback).
 */
const createAnimationCycles = (
  availablePacks: Pack[],
  baseRevolutions: number,
  varianceRevolutions: number
) => {
  const shuffledPacks = [...availablePacks];
  for (let i = shuffledPacks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPacks[i], shuffledPacks[j]] = [
      shuffledPacks[j],
      shuffledPacks[i],
    ];
  }

  const revolutions =
    baseRevolutions + Math.floor(Math.random() * varianceRevolutions);

  const revolutionCycles = Array.from(
    { length: revolutions },
    () => [...shuffledPacks]
  ).flat();

  const endPadding = shuffledPacks.slice(0, 20);

  return {
    cycles: [...revolutionCycles, ...endPadding],
    numRevolutionPacks: revolutionCycles.length,
    shuffledPacks: shuffledPacks,
  };
};

/**
 * Finds the index of the selected pack in the new animation buffer.
 * Includes logic to search main cycles, then padding, then a fallback.
 * @returns The final index (number) to target.
 */
const findTargetIndex = ({
  buffer,
  searchStartIndex,
  numRevolutionPacks,
  selectedPack,
  fallbackPacks,
}: {
  buffer: Pack[];
  searchStartIndex: number;
  numRevolutionPacks: number;
  selectedPack: Pack;
  fallbackPacks: Pack[];
}) => {
  let selectedIndex = -1;
  const searchEndIndex = searchStartIndex + numRevolutionPacks;

  // Search backwards from the end of the *main* revolutions first
  for (let i = searchEndIndex - 1; i >= searchStartIndex; i--) {
    if (buffer[i].id === selectedPack.id) {
      selectedIndex = i;
      break;
    }
  }

  // If not found, search in the end padding
  if (selectedIndex === -1) {
    for (let i = searchEndIndex; i < buffer.length; i++) {
      if (buffer[i].id === selectedPack.id) {
        selectedIndex = i;
        break;
      }
    }
  }

  // If *still* not found, use a random fallback in the last revolution
  if (selectedIndex === -1) {
    console.error(
      "Selected pack not found in animation buffer, using fallback."
    );
    const lastRevolutionStartIndex = searchEndIndex - fallbackPacks.length;
    selectedIndex =
      lastRevolutionStartIndex +
      Math.floor(Math.random() * fallbackPacks.length);
  }
  return selectedIndex;
};

// --- COMPONENT START ---

export default function Draft() {
  const {
    ownerId,
    sessionId,
    finalDraftId,
    players,
    packsSelectedOrder,
    tempInventory,
    checkpointSelectedPack,
    applyCheckpointedPack,
    discardSession,
    confirmSession,
    numPacks,
    confirmed,
    undoLastPick,
    pendingTournament,
    setPendingTournament,
    mutationPending,
    hydrateSession,
    reconcileConfirmation,
    clearLocalSession,
  } = useSessionStore();

  const navigate = useNavigate();
  const { loadDrafts } = useDraftHistoryStore();

  const { loading: inventoryLoading } = useInventoryStore();
  const profile = useUserStore((state) => state.profile);
  const authUid = auth.currentUser?.uid ?? null;
  const profileUid = profile?.uid ?? null;
  const profileRole = profile?.role ?? null;
  const profileStatus = profile?.status ?? null;
  const approvedOwnerId =
    authUid &&
    profileUid === authUid &&
    profileRole === 'admin' &&
    profileStatus === 'approved'
      ? authUid
      : null;

  const packWidth = 176; // Match selector width (w-44 = 176px)
  const packGap = 8;
  const packTotalWidth = packWidth + packGap;

  /** --- Spinner Settings --- */
  const SPINNER_REVOLUTIONS_BASE = 2;
  const SPINNER_REVOLUTIONS_VARIANCE = 2;
  const SPINNER_DURATION_BASE_MS = 6000;
  const SPINNER_DURATION_VARIANCE_MS = 4000;
  const SPINNER_TARGET_OFFSET_VARIANCE_PX = 0;
  const bufferPadding = 25; // PARAMETERIZED: packs to keep before/after visible area

  const [showMatchupsModal, setShowMatchupsModal] = useState(false);

  // Generate round 1 pairings once per session (players are in seat order from initializeSession)
  const round1Pairings = useMemo(
    () => players.length > 0 ? generateRound1Pairings(players) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId]
  );

  // Close the matchups modal if a new session starts
  useEffect(() => { setShowMatchupsModal(false); }, [sessionId]);

  const [buffer, setBuffer] = useState<Pack[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedForDisplay, setSelectedForDisplay] = useState<Pack | null>(
    null
  );
  const [visibleWidth, setVisibleWidth] = useState(800);
  const [isConfirming, setIsConfirming] = useState(false);
  const [noPacksAlert, setNoPacksAlert] = useState(false);
  const [hydrationState, setHydrationState] = useState<'loading' | 'ready' | 'blocked'>('loading');
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmationUnknown, setConfirmationUnknown] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [showDelayedSaving, setShowDelayedSaving] = useState(false);
  const [spinCheckpointState, setSpinCheckpointState] =
    useState<SpinCheckpointState<Pack> | null>(null);
  const [observerError, setObserverError] = useState<string | null>(null);

  const offsetRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const spinStartTime = useRef(0);
  const spinDuration = useRef(3000);
  const startOffset = useRef(0);
  const targetOffset = useRef(0);
  const selectedPackRef = useRef<Pack | null>(null);
  const finalRandomOffset = useRef(0);
  const spinnerWrapperRef = useRef<HTMLDivElement>(null);
  const spinCheckpointRef = useRef<ReturnType<typeof createSpinCheckpointCoordinator<Pack>> | null>(null);
  const unsubscribeSpinRef = useRef<(() => void) | null>(null);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const lifecycleIdentityRef = useRef<string | null>(null);
  const hydrationRequestOwnerRef = useRef<string | null>(null);
  const inventoryReadyOwnerRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  /** --- Sound Settings --- */
  const TICK_INTERVAL_MIN = 70;
  const TICK_INTERVAL_MAX = 140;
  const selectedSound = useRef<HTMLAudioElement | null>(null);
  const tickSound = useRef<HTMLAudioElement | null>(null);
  const lastTickPosition = useRef(0);

  const cancelPendingVisuals = (updateState = true) => {
    const abandonedCoordinator = spinCheckpointRef.current;
    const abandonedSession = useSessionStore.getState();
    if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    requestRef.current = null;
    if (finishTimerRef.current !== null) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    if (savingTimerRef.current !== null) clearTimeout(savingTimerRef.current);
    savingTimerRef.current = null;
    unsubscribeSpinRef.current?.();
    unsubscribeSpinRef.current = null;
    spinCheckpointRef.current = null;
    selectedPackRef.current = null;
    if (abandonedCoordinator) {
      void abandonedCoordinator.settled.then(async () => {
        const checkpointState = abandonedCoordinator.getState();
        if (checkpointState.revision === undefined) return;

        const current = useSessionStore.getState();
        if (
          current.sessionId !== abandonedSession.sessionId ||
          current.ownerId !== abandonedSession.ownerId
        ) return;
        if (
          auth.currentUser?.uid !== abandonedSession.ownerId ||
          !shouldDiscoverChaosCheckpoint(useUserStore.getState().profile)
        ) {
          current.clearLocalSession();
          return;
        }

        try {
          current.applyCheckpointedPack(checkpointState.pack, checkpointState.revision);
        } catch {
          const checkpoint = await activeChaosDraftRepository.get(abandonedSession.ownerId);
          if (
            checkpoint &&
            auth.currentUser?.uid === abandonedSession.ownerId &&
            useSessionStore.getState().sessionId === abandonedSession.sessionId
          ) {
            useSessionStore.getState().hydrateSession(checkpoint);
          }
        }
      }).catch(() => undefined);
    }
    if (updateState && mountedRef.current) {
      setSpinning(false);
      setIsConfirming(false);
      setJustFinished(false);
      setShowPopup(false);
      setSelectedForDisplay(null);
      setSpinCheckpointState(null);
      setShowDelayedSaving(false);
    }
  };

  const recoverLatestCheckpoint = async (error: unknown) => {
    const recoveryOwnerId = auth.currentUser?.uid;
    const recoveryGeneration = ++lifecycleGenerationRef.current;
    cancelPendingVisuals();
    setActionError(null);
    setConfirmationUnknown(false);
    setIntegrityError(null);
    setHydrationError(null);
    setHydrationState('loading');

    if (!recoveryOwnerId || !shouldDiscoverChaosCheckpoint(useUserStore.getState().profile)) {
      setHydrationError('An approved admin account is required to recover this draft.');
      setHydrationState('blocked');
      return;
    }

    try {
      const checkpoint = await activeChaosDraftRepository.get(recoveryOwnerId);
      if (
        !mountedRef.current ||
        lifecycleGenerationRef.current !== recoveryGeneration ||
        auth.currentUser?.uid !== recoveryOwnerId ||
        useUserStore.getState().profile?.uid !== recoveryOwnerId
      ) return;

      if (!checkpoint) {
        setHydrationError('The active draft could not be found. Its status must be checked before continuing.');
        setHydrationState('blocked');
        return;
      }
      hydrateSession(checkpoint);
      setActionError('This draft was updated on another device. The latest saved state has been loaded.');
      setHydrationState('ready');
    } catch (recoveryError) {
      if (!mountedRef.current || lifecycleGenerationRef.current !== recoveryGeneration) return;
      const message = recoveryError instanceof Error
        ? recoveryError.message
        : 'The latest saved draft could not be loaded.';
      setHydrationError(`The latest saved draft could not be loaded: ${message}`);
      setHydrationState('blocked');
    }

    if (!(error instanceof ChaosDraftConflictError)) {
      setObserverError(error instanceof Error ? error.message : 'The saved pack could not be applied locally.');
    }
  };

  const handleMutationError = (error: unknown, fallback: string) => {
    if (error instanceof ChaosDraftConflictError) {
      void recoverLatestCheckpoint(error);
      return;
    }
    setActionError(error instanceof Error ? error.message : fallback);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      cancelPendingVisuals(false);
    };
  }, []);

  useEffect(() => {
    const identity = `${authUid ?? ''}:${profileUid ?? ''}:${profileRole ?? ''}:${profileStatus ?? ''}:${ownerId}:${sessionId}`;
    if (lifecycleIdentityRef.current === identity) return;

    if (lifecycleIdentityRef.current !== null) {
      lifecycleGenerationRef.current += 1;
      cancelPendingVisuals();
    }
    lifecycleIdentityRef.current = identity;
    hydrationRequestOwnerRef.current = null;
    if (inventoryReadyOwnerRef.current !== approvedOwnerId) {
      inventoryReadyOwnerRef.current = null;
    }
    setConfirmationUnknown(false);
    setIntegrityError(null);

    if (!profileUid) {
      setHydrationState('loading');
    } else if (!approvedOwnerId) {
      setHydrationError('Chaos Draft is available only to an approved admin.');
      setHydrationState('blocked');
    } else if (
      sessionId &&
      ownerId === approvedOwnerId &&
      inventoryReadyOwnerRef.current === approvedOwnerId
    ) {
      setHydrationError(null);
      setHydrationState('ready');
    } else {
      setHydrationError(null);
      setHydrationState('loading');
    }
  }, [authUid, profileUid, profileRole, profileStatus, approvedOwnerId, ownerId, sessionId]);

  useEffect(() => {
    if (!approvedOwnerId) return;
    if (inventoryReadyOwnerRef.current !== approvedOwnerId) {
      if (inventoryLoading) {
        setHydrationState('loading');
        return;
      }
      inventoryReadyOwnerRef.current = approvedOwnerId;
    }
    if (sessionId && ownerId === approvedOwnerId) {
      setHydrationError(null);
      setHydrationState('ready');
      return;
    }
    if (hydrationRequestOwnerRef.current === approvedOwnerId) return;

    hydrationRequestOwnerRef.current = approvedOwnerId;
    const generation = lifecycleGenerationRef.current;
    setHydrationError(null);
    setHydrationState('loading');
    void activeChaosDraftRepository.get(approvedOwnerId).then((checkpoint) => {
      if (
        !mountedRef.current ||
        lifecycleGenerationRef.current !== generation ||
        auth.currentUser?.uid !== approvedOwnerId ||
        useUserStore.getState().profile?.uid !== approvedOwnerId
      ) return;
      if (!checkpoint) {
        setHydrationError('No unfinished Chaos Draft was found. Start one from the Draft page.');
        setHydrationState('blocked');
        return;
      }
      try {
        hydrateSession(checkpoint);
        setHydrationState('ready');
      } catch (error) {
        setHydrationError(
          error instanceof Error
            ? `The saved draft could not be restored: ${error.message}`
            : 'The saved draft could not be restored.',
        );
        setHydrationState('blocked');
      }
    }).catch((error) => {
      if (!mountedRef.current || lifecycleGenerationRef.current !== generation) return;
      setHydrationError(
        error instanceof Error
          ? `The saved draft could not be loaded: ${error.message}`
          : 'The saved draft could not be loaded.',
      );
      setHydrationState('blocked');
    });
  }, [approvedOwnerId, inventoryLoading, sessionId, ownerId, hydrateSession]);

  useEffect(() => {
    if (savingTimerRef.current !== null) clearTimeout(savingTimerRef.current);
    savingTimerRef.current = null;
    setShowDelayedSaving(false);
    if (spinCheckpointState?.phase !== 'waiting-for-save') return;

    savingTimerRef.current = setTimeout(() => {
      savingTimerRef.current = null;
      setShowDelayedSaving(true);
    }, 1000);
    return () => {
      if (savingTimerRef.current !== null) clearTimeout(savingTimerRef.current);
      savingTimerRef.current = null;
    };
  }, [spinCheckpointState?.phase]);

  useEffect(() => {
    selectedSound.current = new Audio(selectedSoundFile);
    selectedSound.current.volume = 0.35;
  }, []);

  useEffect(() => {
    tickSound.current = new Audio(tickSoundFile);
    tickSound.current.volume = 0.1;
  }, []);

  const playTick = () => {
    if (!tickSound.current) return;
    tickSound.current.currentTime = 0;
    tickSound.current.play().catch(() => {});
  };

  /** Easing Function: A smoother ease-out cubic curve */
  const easeOutCubic = (t: number) => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  };

  /** Measure the spinner width */
  useEffect(() => {
    const measureWidth = () => {
      if (spinnerWrapperRef.current) {
        setVisibleWidth(spinnerWrapperRef.current.offsetWidth);
      }
    };
    measureWidth();
    window.addEventListener("resize", measureWidth);
    return () => window.removeEventListener("resize", measureWidth);
  }, []);

  // Effect 1: Reset buffer ONLY on new session
  useEffect(() => {
    setBuffer([]);
    offsetRef.current = 0;
  }, [sessionId]);

  // Effect 2: Populate buffer when inventory is ready, but ONLY if buffer is empty
  useEffect(() => {
    if (tempInventory.length > 0 && buffer.length === 0) {
      // --- RANDOMIZATION ADDED ---
      // Create a shuffled copy of the inventory for a random starting order.
      const allPacks = [...tempInventory];
      for (let i = allPacks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPacks[i], allPacks[j]] = [allPacks[j], allPacks[i]];
      }
      // --- END RANDOMIZATION ---

      const leftPadding = [...allPacks, ...allPacks].slice(
        -(bufferPadding * 2)
      );
      const initialBuffer = [
        ...leftPadding,
        ...allPacks,
        ...allPacks,
        ...allPacks,
      ];
      setBuffer(initialBuffer);

      // offsetRef represents the position that should align with the selector
      // Using the formula: position = idx * packWidth + idx * packGap
      const initialIndex = leftPadding.length;
      offsetRef.current = initialIndex * packWidth + initialIndex * packGap;
      console.log(
        `Initial setup: leftPadding.length=${leftPadding.length}, offsetRef=${offsetRef.current}, packWidth=${packWidth}, packGap=${packGap}`
      );
    }
  }, [
    tempInventory,
    buffer.length,
    packWidth,
    packGap,
    bufferPadding,
    sessionId,
  ]);

  // Memoize the list of packs that are still available to be picked.
  const availablePacks = useMemo(() => {
    const selectedIds = new Set(packsSelectedOrder.map((p) => p.id));
    // A pack is available if it hasn't been selected AND has in-person quantity.
    return tempInventory.filter(
      (p) => !selectedIds.has(p.id) && p.inPerson > 0
    );
  }, [tempInventory, packsSelectedOrder]);

  /** Weighted random selection */
  const pickWeightedRandomPack = (packs: Pack[]): Pack | null => {
    if (confirmed) return null;

    // The 'packs' argument is already filtered to be only available, un-picked packs.
    if (!packs.length) return null;
    const totalWeight = availablePacks.reduce((sum, p) => sum + p.inPerson, 0);
    if (totalWeight <= 0) {
      // Fallback for non-weighted packs or if all quantities are 0
      return availablePacks[Math.floor(Math.random() * availablePacks.length)];
    }

    let rand = Math.random() * totalWeight;
    for (const pack of availablePacks) {
      if (rand < pack.inPerson) return pack;
      rand -= pack.inPerson;
    }

    // Fallback in case of floating point issues
    return availablePacks[availablePacks.length - 1];
  };

  /** Animate spinner */
  const animate = (time: number) => {
    const previousOffset = offsetRef.current;
    if (!spinStartTime.current) spinStartTime.current = time;
    const elapsed = time - spinStartTime.current;
    const t = Math.min(elapsed / spinDuration.current, 1);
    const eased = easeOutCubic(t);
    const newOffset =
      startOffset.current + (targetOffset.current - startOffset.current) * eased;
    offsetRef.current = newOffset;
    setBuffer((prev) => [...prev]); // Force re-render of children

    if (t < 1) {
      // --- Tick Logic ---
      const delta = Math.abs(newOffset - previousOffset);
      const speedFactor = delta > 0 ? delta / packTotalWidth : 0;
      const interval = Math.max(
        TICK_INTERVAL_MIN,
        Math.min(
          TICK_INTERVAL_MAX,
          TICK_INTERVAL_MAX -
            speedFactor * (TICK_INTERVAL_MAX - TICK_INTERVAL_MIN)
        )
      );
      const now = performance.now();
      const packIndex = Math.round(offsetRef.current / (packWidth + packGap));
      if (
        packIndex !== lastTickPosition.current &&
        (!tickSound.current?.dataset.lastPlay ||
          now - Number(tickSound.current.dataset.lastPlay) > interval)
      ) {
        playTick();
        lastTickPosition.current = packIndex;
        if (tickSound.current) tickSound.current.dataset.lastPlay = String(now);
      }
      requestRef.current = requestAnimationFrame(animate);
    } else {
      // --- Spin finished ---
      offsetRef.current = targetOffset.current;
      setSpinning(false);
      setJustFinished(true);
      spinStartTime.current = 0;
      setBuffer((prev) => [...prev]); // Trigger final re-render
      if (selectedSound.current) {
        selectedSound.current.currentTime = 0;
        selectedSound.current.playbackRate = 0.65;
        selectedSound.current.play().catch(() => {});
      }
      if (tickSound.current) {
        tickSound.current.pause();
        tickSound.current.currentTime = 0;
      }
      finishTimerRef.current = setTimeout(() => {
        finishTimerRef.current = null;
        setJustFinished(false);
      }, 100);
      try {
        spinCheckpointRef.current?.markAnimationComplete();
      } catch (error) {
        setObserverError(error instanceof Error ? error.message : 'The spin status could not be displayed.');
      }
    }
  };

  /**
   * --- REFACTORED HANDLESPIN ---
   * This function now orchestrates the spin by calling helper functions.
   */
  const handleSpin = () => {
    // 1. Guard Clauses: Check if we can spin
    if (!canSpin) return;
    const selectedPack = pickWeightedRandomPack(availablePacks);
    if (!selectedPack) {
      setNoPacksAlert(true);
      return;
    }

    // 2. Initial State Setup
    setShowPopup(false);
    setSelectedForDisplay(null);
    selectedPackRef.current = selectedPack;
    setSpinning(true);
    setActionError(null);
    setObserverError(null);

    const spinGeneration = lifecycleGenerationRef.current;
    const coordinator = createSpinCheckpointCoordinator(selectedPack, checkpointSelectedPack);
    spinCheckpointRef.current = coordinator;
    setSpinCheckpointState(coordinator.getState());
    unsubscribeSpinRef.current = coordinator.subscribe((state) => {
      if (!mountedRef.current || lifecycleGenerationRef.current !== spinGeneration) return;
      setSpinCheckpointState(state);

      if (state.phase === 'failed' && state.error instanceof ChaosDraftConflictError) {
        void recoverLatestCheckpoint(state.error);
        return;
      }
      if (state.phase !== 'ready' || state.revision === undefined) return;

      try {
        applyCheckpointedPack(state.pack, state.revision);
        const canonicalPack = useSessionStore.getState().packsSelectedOrder.at(-1) ?? state.pack;
        setSelectedForDisplay(canonicalPack);
        setShowPopup(true);
        selectedPackRef.current = null;
        unsubscribeSpinRef.current?.();
        unsubscribeSpinRef.current = null;
        spinCheckpointRef.current = null;
      } catch (error) {
        setObserverError(error instanceof Error ? error.message : 'The saved pack could not be applied locally.');
        void recoverLatestCheckpoint(error);
      }
    });

    // 3. Buffer Trimming: Clean up the buffer before adding to it
    const { trimmedBuffer, offsetAdjustment } = trimBuffer({
      buffer,
      offset: offsetRef.current,
      visibleWidth,
      packTotalWidth,
      packWidth,
      packGap,
      bufferPadding,
    });
    // Apply the adjustment to the *live* ref
    offsetRef.current -= offsetAdjustment;

    // 4. Create Animation Cycles: Get the new packs to spin through
    //    IMPORTANT: We use the full tempInventory for the visual spin.
    const { cycles, numRevolutionPacks, shuffledPacks } =
      createAnimationCycles(
        tempInventory.filter((p) => p.inPerson > 0), // Visually spin all packs with quantity
        SPINNER_REVOLUTIONS_BASE,
        SPINNER_REVOLUTIONS_VARIANCE
      );

    const newBuffer = [...trimmedBuffer, ...cycles];
    const searchStartIndex = trimmedBuffer.length;

    // 5. Find Target Index: Get the exact index to land on
    const selectedIndex = findTargetIndex({
      buffer: newBuffer,
      searchStartIndex,
      numRevolutionPacks,
      selectedPack,
      fallbackPacks: shuffledPacks,
    });

    // 6. Set Final State & Start Animation
    setBuffer(newBuffer);

    spinDuration.current =
      SPINNER_DURATION_BASE_MS + Math.random() * SPINNER_DURATION_VARIANCE_MS;
    startOffset.current = offsetRef.current; // Use the *adjusted* offset

    finalRandomOffset.current =
      (Math.random() - 0.5) * SPINNER_TARGET_OFFSET_VARIANCE_PX;

    // Target offset using the same position formula
    const targetPosition = selectedIndex * packWidth + selectedIndex * packGap;
    targetOffset.current = targetPosition + finalRandomOffset.current;

    spinStartTime.current = 0;
    lastTickPosition.current = Math.round(offsetRef.current / packTotalWidth);
    requestRef.current = requestAnimationFrame(animate);
  };

  const handleConfirm = async () => {
    if (!pendingTournament || packsSelectedOrder.length !== numPacks || mutationLocked) return;
    const operationGeneration = lifecycleGenerationRef.current;
    const operationOwner = ownerId;
    setActionError(null);
    setIsConfirming(true);
    try {
      await confirmSession();
      await loadDrafts();
      if (
        !mountedRef.current ||
        lifecycleGenerationRef.current !== operationGeneration ||
        auth.currentUser?.uid !== operationOwner
      ) return;
      clearLocalSession();
      navigate('/tournament');
    } catch (error) {
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      if (error instanceof ChaosDraftConflictError) {
        void recoverLatestCheckpoint(error);
      } else if (error instanceof ChaosDraftValidationError) {
        setActionError(error.message);
      } else {
        setConfirmationUnknown(true);
        setActionError('Confirmation status is unknown. Check the saved draft before trying again.');
      }
    } finally {
      if (mountedRef.current && lifecycleGenerationRef.current === operationGeneration) {
        setIsConfirming(false);
      }
    }
  };

  const handleStartRound1 = async () => {
    const tournament: DraftTournament = {
      seats: playersToSeats(players),
      rounds: [{ roundNumber: 1, pairings: round1Pairings, status: 'active' }],
      currentRound: 1,
      totalRounds: 3,
      status: 'active',
    };
    const operationGeneration = lifecycleGenerationRef.current;
    setActionError(null);
    setIsConfirming(true);
    try {
      await setPendingTournament(tournament);
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      setShowMatchupsModal(false);
    } catch (error) {
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      handleMutationError(error, 'Failed to save Round 1.');
    } finally {
      if (mountedRef.current && lifecycleGenerationRef.current === operationGeneration) {
        setIsConfirming(false);
      }
    }
  };

  const handleUndo = async () => {
    setActionError(null);
    try {
      await undoLastPick();
    } catch (error) {
      handleMutationError(error, 'Failed to undo the last pick.');
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm('Discard this unfinished Chaos Draft? This cannot be undone.')) return;
    const operationGeneration = lifecycleGenerationRef.current;
    setActionError(null);
    try {
      await discardSession();
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      navigate('/drafts');
    } catch (error) {
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      handleMutationError(error, 'Failed to discard this draft.');
    }
  };

  const handleRetrySave = async () => {
    setObserverError(null);
    setActionError(null);
    try {
      await spinCheckpointRef.current?.retry();
    } catch (error) {
      setObserverError(error instanceof Error ? error.message : 'The save retry could not be observed.');
    }
  };

  const handleCheckAgain = async () => {
    const identifiers = { ownerId, sessionId, finalDraftId };
    const operationGeneration = lifecycleGenerationRef.current;
    setActionError(null);
    setIsConfirming(true);
    try {
      const result = await reconcileConfirmation();
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;

      if (result.status === 'committed') {
        await loadDrafts();
        if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
        clearLocalSession();
        navigate('/tournament');
      } else if (result.status === 'not-committed') {
        setConfirmationUnknown(false);
        setActionError('Confirmation did not complete. The latest saved draft is ready to try again.');
      } else {
        setConfirmationUnknown(false);
        setIntegrityError(
          `Draft integrity check failed. Owner: ${identifiers.ownerId}; session: ${identifiers.sessionId}; final draft: ${identifiers.finalDraftId}.`,
        );
      }
    } catch (error) {
      if (!mountedRef.current || lifecycleGenerationRef.current !== operationGeneration) return;
      setConfirmationUnknown(true);
      setActionError(
        error instanceof Error
          ? `Confirmation status is still unknown: ${error.message}`
          : 'Confirmation status is still unknown.',
      );
    } finally {
      if (mountedRef.current && lifecycleGenerationRef.current === operationGeneration) {
        setIsConfirming(false);
      }
    }
  };

  const isDraftComplete = packsSelectedOrder.length === numPacks;

  let nextPlayerName = "";
  if (players.length > 0 && !isDraftComplete) {
    const nextPlayerIndex = packsSelectedOrder.length % players.length;
    nextPlayerName = players[nextPlayerIndex]?.name || "";
  }

  const spinWritePending = spinCheckpointState !== null && (
    spinCheckpointState.phase === 'animating' ||
    spinCheckpointState.phase === 'waiting-for-save' ||
    spinCheckpointState.phase === 'failed'
  );
  const mutationLocked =
    hydrationState !== 'ready' ||
    mutationPending ||
    spinWritePending ||
    isConfirming ||
    confirmationUnknown ||
    integrityError !== null;
  const canSpin = !spinning && !mutationLocked && availablePacks.length > 0 && !confirmed;
  const canUndo = packsSelectedOrder.length > 0 && !spinning && !mutationLocked && !confirmed;

  const spinButtonText = () => {
    if (spinning) return "Spinning...";
    if (isDraftComplete) return "Draft Complete";
    if (!canSpin && !isDraftComplete) return "No Packs Left";
    if (nextPlayerName) return `Spin for ${nextPlayerName}`;
    return "Spin for Next Player";
  };

  if (hydrationState === 'loading') {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-xl font-semibold text-gray-300">Loading saved Chaos Draft…</p>
        <p className="mt-2 text-gray-500">Waiting for your account and live inventory.</p>
      </div>
    );
  }

  if (hydrationState === 'blocked') {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Chaos Draft unavailable</h2>
        <p className="text-gray-300">{hydrationError}</p>
        <p className="text-sm text-gray-500">Any saved checkpoint has been left intact for recovery.</p>
        <Link
          to="/drafts"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold"
        >
          Back to Drafts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">🎡 Chaos Draft</h2>

      {actionError && (
        <div role="alert" className="rounded-lg border border-yellow-700 bg-yellow-950/40 px-4 py-3 text-yellow-200">
          {actionError}
        </div>
      )}
      {observerError && (
        <div role="alert" className="rounded-lg border border-orange-700 bg-orange-950/40 px-4 py-3 text-orange-200">
          The saved spin could not be applied to this page: {observerError}
        </div>
      )}
      {integrityError && (
        <div role="alert" className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-red-200">
          {integrityError} Contact support with these identifiers.
        </div>
      )}
      {confirmationUnknown && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 px-4 py-3 text-yellow-100 flex items-center justify-between gap-4">
          <span>Confirmation status is unknown. All draft changes are locked.</span>
          <button
            onClick={handleCheckAgain}
            disabled={isConfirming || mutationPending}
            className="shrink-0 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold"
          >
            {isConfirming ? 'Checking…' : 'Check Again'}
          </button>
        </div>
      )}
      {spinCheckpointState?.phase === 'failed' && (
        <div role="alert" className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-red-100 flex items-center justify-between gap-4">
          <span>Could not save this pack</span>
          <button
            onClick={handleRetrySave}
            className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold"
          >
            Retry Save
          </button>
        </div>
      )}
      {showDelayedSaving && spinCheckpointState?.phase === 'waiting-for-save' && (
        <p className="text-sm text-gray-400 text-center">Saving selected pack…</p>
      )}

      {/* --- Spinner --- */}
      <div className="relative flex items-center justify-center h-72">
        {inventoryLoading ? (
          <div className="text-xl font-semibold text-gray-400">
            Loading Inventory...
          </div>
        ) : buffer.length === 0 ? (
          <div className="text-center text-gray-400">
            <h3 className="text-xl font-semibold">No Packs Found</h3>
            <p>Go to "Session Setup" to start a new draft.</p>
          </div>
        ) : (
          <div
            ref={spinnerWrapperRef}
            className="overflow-hidden relative border border-gray-700 rounded-2xl bg-gray-800 w-full"
            style={{
              height: "260px",
              perspective: "1000px",
            }}
          >
            {/* Center selector */}
            <div
              className={`absolute top-0 bottom-0 border-4 border-yellow-400 pointer-events-none rounded-lg z-10 transition-all duration-300 ${
                justFinished
                  ? "shadow-[0_0_30px_rgba(250,204,21,0.9)] scale-105"
                  : "shadow-[0_0_20px_rgba(250,204,21,0.6)]"
              }`}
              style={{
                left: "50%",
                transform: justFinished
                  ? "translateX(-50%) scale(1.05)"
                  : "translateX(-50%)",
                width: `${packWidth}px`,
                margin: "auto 0",
                height: "240px",
                top: "10px",
              }}
            />

            <div
              className="flex absolute top-0 h-full items-center"
              style={{
                left: "50%",
                transform: `translateX(calc(-${offsetRef.current}px - ${
                  packWidth / 2
                }px))`,
                transition: spinning ? "none" : "transform 0.3s ease-out",
                transformStyle: "preserve-3d",
              }}
            >
              {/* --- VIRTUALIZATION LOGIC START --- */}
              {(() => {
                // 1. Calculate the index of the pack currently at the center
                const centerIndex = Math.round(
                  offsetRef.current / packTotalWidth
                );

                // 2. Calculate how many packs are visible on one side
                const visiblePacksPerSide = Math.ceil(
                  (visibleWidth / 2) / packTotalWidth
                );

                // 3. Define the render buffer (how many *extra* packs to render off-screen)
                const RENDER_BUFFER = 15; // You can tune this number

                // 4. Calculate the start and end index for slicing the buffer
                const startIndex = Math.max(
                  0,
                  centerIndex - visiblePacksPerSide - RENDER_BUFFER
                );
                const endIndex = Math.min(
                  buffer.length,
                  centerIndex + visiblePacksPerSide + RENDER_BUFFER
                );

                // 5. Slice the buffer *before* mapping
                const visibleBuffer = buffer.slice(startIndex, endIndex);

                // 6. Calculate the width of the spacer
                const spacerWidth = startIndex * packTotalWidth;

                return (
                  <>
                    {/* Spacer div */}
                    <div
                      style={{
                        width: `${spacerWidth}px`,
                        flexShrink: 0,
                        height: "1px",
                      }}
                    />

                    {/* Map over *visible* buffer */}
                    {visibleBuffer.map((pack, i) => {
                      // 7. Get the *original* index
                      const idx = startIndex + i;

                      const packPosition = idx * packWidth + idx * packGap;
                      const distFromCenter = packPosition - offsetRef.current;
                      const isCentered =
                        Math.abs(distFromCenter) < packWidth / 2;

                      // --- 3D Transform Calculations ---
                      const clampedDist = Math.max(
                        -visibleWidth * 1.5,
                        Math.min(visibleWidth * 1.5, -distFromCenter)
                      );
                      const rotationY = clampedDist / 60;
                      const translationZ = -Math.abs(clampedDist) / 10;

                      // SMOOTH SCALING
                      const distanceFromCenter = Math.abs(distFromCenter);
                      const baseScale = Math.max(
                        0.85,
                        1.0 - distanceFromCenter / 2000
                      );
                      const finalScale =
                        isCentered && justFinished
                          ? baseScale * 1.03
                          : baseScale;

                      // Find if this pack type has been selected in the current session
                      const selectedPackInfo = packsSelectedOrder.find(
                        (p) => p.id === pack.id
                      );

                      const playerWhoSelected = selectedPackInfo
                        ? players[
                            packsSelectedOrder.findIndex(
                              (p) => p.id === pack.id
                            ) % players.length
                          ]
                        : undefined;

                      return (
                        <div
                          key={`${pack.id}-${idx}`}
                          className="flex-shrink-0 rounded-md relative"
                          style={{
                            width: `${packWidth}px`,
                            height: "240px",
                            minWidth: `${packWidth}px`,
                            maxWidth: `${packWidth}px`,
                            marginRight: `${packGap}px`,
                            transform: `
                                scale(${finalScale})
                                rotateY(${rotationY}deg)
                                translateZ(${translationZ}px)
                              `,
                            filter: selectedPackInfo
                              ? "grayscale(100%) brightness(0.4)"
                              : isCentered
                              ? "brightness(1.1)"
                              : spinning
                              ? "brightness(0.7)"
                              : "brightness(0.85)",
                            transformStyle: "preserve-3d",
                          }}
                        >
                          <div
                            className="relative w-full h-full"
                            style={{
                              transform: `rotateY(${rotationY * 0.1}deg)`,
                              boxShadow:
                                "inset 0 0 15px 5px rgba(0,0,0,0.3)",
                              borderRadius: "0.375rem",
                            }}
                          >
                            <img
                              src={pack.imageUrl}
                              alt={pack.name}
                              className="w-full h-full object-cover rounded-md"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://placehold.co/200x280/1F2937/FFF?text=No+Image";
                              }}
                            />
                            <div
                              className="absolute inset-0 rounded-md opacity-70 mix-blend-overlay"
                              style={{
                                background:
                                  "linear-gradient(110deg, rgba(255,255,250) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)",
                                backgroundSize: "200% 100%",
                                backgroundPosition: `${-rotationY * 3}px 0`,
                              }}
                            />
                          </div>

                          {playerWhoSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-md">
                              <div className="text-white font-bold text-sm bg-blue-600 px-3 py-1 rounded-full shadow-lg">
                                {playerWhoSelected.name}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              {/* --- VIRTUALIZATION LOGIC END --- */}
            </div>
          </div>
        )}

        {/* --- Popup --- */}
        {showPopup && selectedForDisplay && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-in fade-in zoom-in duration-300">
            <div
              className="absolute inset-0"
              onClick={() => setShowPopup(false)}
            />
            <div className="relative bg-gray-800 rounded-2xl p-8 shadow-2xl border-4 border-yellow-400 max-w-md animate-in slide-in-from-bottom-4 duration-500">
              <div className="absolute -top-3 -right-3 bg-yellow-400 text-gray-900 font-bold text-lg px-4 py-1 rounded-full shadow-lg">
                SELECTED!
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-80 rounded-lg overflow-hidden shadow-2xl ring-4 ring-yellow-400 ring-offset-4 ring-offset-gray-900">
                  <img
                    src={selectedForDisplay.imageUrl}
                    alt={selectedForDisplay.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-2xl font-bold text-yellow-400 text-center">
                  {selectedForDisplay.name}
                </h3>
                <button
                  onClick={() => setShowPopup(false)}
                  className="mt-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold px-8 py-3 rounded-lg shadow-lg transition-all hover:scale-105"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- No Packs Alert --- */}
        {noPacksAlert && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-sm w-full">
              <h3 className="text-2xl font-bold text-white">No Packs Left!</h3>
              <p className="text-gray-400 mt-2">
                All available packs have been selected for this draft.
              </p>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setNoPacksAlert(false)}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- Buttons --- */}
      <div className="flex justify-center mt-4">
        <button
          onClick={handleSpin}
          disabled={!canSpin || inventoryLoading || buffer.length === 0}
          className="px-8 py-4 rounded-lg font-bold text-xl transition-all shadow-lg disabled:bg-gray-600 disabled:shadow-none disabled:cursor-not-allowed
                     bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/30"
        >
          {spinButtonText()}
        </button>
      </div>

      {/* --- Player list --- */}
      <div>
        <h3 className="mt-4 text-2xl font-semibold mb-3">Players & Picks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {players.map((player) => (
            <div
              key={player.id}
              className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700"
            >
              <h4 className="text-lg font-semibold mb-3 text-white">
                {player.name}
              </h4>
              <div className="flex flex-wrap gap-3">
                {player.selectedPacks.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => {
                      setSelectedForDisplay(pack);
                      setShowPopup(true);
                    }}
                    className="group relative transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
                  >
                    <img
                      src={pack.imageUrl}
                      alt={pack.name}
                      className="w-24 h-32 rounded-lg object-cover border-2 border-gray-600 group-hover:border-blue-400 transition-colors"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                  </button>
                ))}
                {player.selectedPacks.length === 0 && (
                  <p className="text-gray-500 text-sm italic">
                    No packs selected yet
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Session Management Buttons --- */}
      <div className="mt-8 flex justify-center gap-4 flex-wrap">
        <button
          onClick={handleDiscard}
          disabled={mutationLocked}
          className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600"
        >
          Discard Draft
        </button>

        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          Undo Last Pick
        </button>

        {confirmed ? (
          <div className="px-5 py-3 rounded-lg font-semibold bg-green-800 text-white shadow-lg">
            🎉 Draft Complete!
          </div>
        ) : isDraftComplete && pendingTournament === null && players.length > 0 ? (
          <button
            onClick={() => setShowMatchupsModal(true)}
            disabled={mutationLocked}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-lg font-semibold transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Set Up Round 1 →
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={!isDraftComplete || pendingTournament === null || mutationLocked}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {isConfirming
              ? "Confirming..."
              : `Confirm Session (${packsSelectedOrder.length} / ${numPacks})`}
          </button>
        )}
      </div>
      {/* Matchups modal — appears after all packs are spun */}
      {showMatchupsModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-700 max-w-md w-full mx-4">
            <RoundMatchups
              players={players}
              pairings={round1Pairings}
              onStart={handleStartRound1}
              disabled={mutationLocked}
            />
          </div>
        </div>
      )}
    </div>
  );
}
