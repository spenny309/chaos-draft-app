import { useState, useEffect, useRef, useMemo } from "react";
// Assuming state is in src/state
import { useSessionStore } from "../state/sessionStore";
import { useInventoryStore, type Pack } from "../state/inventoryStore";

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
    sessionId,
    players,
    packsSelectedOrder,
    tempInventory,
    selectPackForNextPlayer,
    resetSession,
    confirmSession,
    numPacks,
    confirmed,
    undoLastPick,
  } = useSessionStore();

  const { loading: inventoryLoading } = useInventoryStore();

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

  const offsetRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const spinStartTime = useRef(0);
  const spinDuration = useRef(3000);
  const startOffset = useRef(0);
  const targetOffset = useRef(0);
  const selectedPackRef = useRef<Pack | null>(null);
  const finalRandomOffset = useRef(0);
  const spinnerWrapperRef = useRef<HTMLDivElement>(null);

  /** --- Sound Settings --- */
  const TICK_INTERVAL_MIN = 70;
  const TICK_INTERVAL_MAX = 140;
  const selectedSound = useRef<HTMLAudioElement | null>(null);
  const tickSound = useRef<HTMLAudioElement | null>(null);
  const lastTickPosition = useRef(0);

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
      const allPacks = tempInventory;

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

  // Memoize the list of available packs
  const availablePacks = useMemo(() => {
    return tempInventory.filter(
      (p) => !packsSelectedOrder.some((s) => s.id === p.id)
    );
  }, [tempInventory, packsSelectedOrder]);

  /** Weighted random selection */
  const pickWeightedRandomPack = (packs: Pack[]): Pack | null => {
    if (confirmed) return null;
    if (!packs.length) return null;

    const totalWeight = packs.reduce((sum, p) => sum + p.quantity, 0);
    if (totalWeight <= 0) {
      return packs[Math.floor(Math.random() * packs.length)];
    }

    let rand = Math.random() * totalWeight;
    for (const pack of packs) {
      if (rand < pack.quantity) return pack;
      rand -= pack.quantity;
    }
    return packs[packs.length - 1];
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
      setTimeout(() => {
        setJustFinished(false);
        if (selectedPackRef.current) {
          setSelectedForDisplay(selectedPackRef.current);
          setShowPopup(true);
          selectPackForNextPlayer(selectedPackRef.current);
          selectedPackRef.current = null;
        }
      }, 100);
    }
  };

  /**
   * --- REFACTORED HANDLESPIN ---
   * This function now orchestrates the spin by calling helper functions.
   */
  const handleSpin = () => {
    // 1. Guard Clauses: Check if we can spin
    if (spinning || confirmed) return;
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
    const { cycles, numRevolutionPacks, shuffledPacks } =
      createAnimationCycles(
        availablePacks,
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
    setIsConfirming(true);
    await confirmSession();
    setIsConfirming(false);
  };

  const isDraftComplete = packsSelectedOrder.length === numPacks;

  let nextPlayerName = "";
  if (players.length > 0 && !isDraftComplete) {
    const nextPlayerIndex = packsSelectedOrder.length % players.length;
    nextPlayerName = players[nextPlayerIndex]?.name || "";
  }

  const canSpin = !spinning && availablePacks.length > 0 && !confirmed;
  const canUndo = packsSelectedOrder.length > 0 && !spinning && !confirmed;

  const spinButtonText = () => {
    if (spinning) return "Spinning...";
    if (isDraftComplete) return "Draft Complete";
    if (!canSpin && !isDraftComplete) return "No Packs Left";
    if (nextPlayerName) return `Spin for ${nextPlayerName}`;
    return "Spin for Next Player";
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-3xl font-bold text-white">🎡 Chaos Draft</h2>

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

                      const selectedEntry = packsSelectedOrder.find(
                        (s) => s.id === pack.id
                      );

                      const playerWhoSelected = selectedEntry
                        ? players.find((p) =>
                            p.selectedPacks.some((sp) => sp.id === pack.id)
                          )
                        : null;

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
                            filter: selectedEntry
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
          onClick={resetSession}
          disabled={isConfirming}
          className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600"
        >
          Reset Session
        </button>

        <button
          onClick={undoLastPick}
          disabled={!canUndo}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-3 rounded-lg font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          Undo Last Pick
        </button>

        {confirmed ? (
          <div className="px-5 py-3 rounded-lg font-semibold bg-green-800 text-white shadow-lg">
            🎉 Draft Complete!
          </div>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={!isDraftComplete || isConfirming || spinning}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {isConfirming
              ? "Confirming..."
              : `Confirm Session (${packsSelectedOrder.length} / ${numPacks})`}
          </button>
        )}
      </div>
    </div>
  );
}