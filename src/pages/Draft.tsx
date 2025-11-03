import { useState, useEffect, useRef } from "react";
// Assuming state is in src/state
import { useSessionStore } from "../state/sessionStore";
import { useInventoryStore, type Pack } from "../state/inventoryStore";

import tickSoundFile from "../assets/tick.mp3";
import selectedSoundFile from "../assets/selected.mp3";

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
  const visibleWidth = 800;
  const packTotalWidth = packWidth + packGap;

  const [buffer, setBuffer] = useState<Pack[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedForDisplay, setSelectedForDisplay] = useState<Pack | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [noPacksAlert, setNoPacksAlert] = useState(false);

  const offsetRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const spinStartTime = useRef(0);
  const spinDuration = useRef(3000);
  const startOffset = useRef(0);
  const targetOffset = useRef(0);
  const selectedPackRef = useRef<Pack | null>(null);

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

  /** Easing Function */
  const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

  /** Initialize buffer */
  useEffect(() => {
    if (tempInventory.length > 0) {
      const allPacks = tempInventory;
      const leftPadding = [...allPacks, ...allPacks].slice(-5);
      const initialBuffer = [
        ...leftPadding,
        ...allPacks,
        ...allPacks,
        ...allPacks,
      ];
      setBuffer(initialBuffer);
      offsetRef.current = leftPadding.length * packTotalWidth;
    } else {
      setBuffer([]);
      offsetRef.current = 0;
    }
  }, [sessionId, packTotalWidth]); // Only re-run on new session

  /** Weighted random selection */
  const pickWeightedRandomPack = (): Pack | null => {
    if (confirmed) return null;
    if (!tempInventory.length) return null;

    const available = tempInventory.filter(
      (p) => !packsSelectedOrder.some((s) => s.id === p.id)
    );
    if (!available.length) return null;

    const totalWeight = available.reduce((sum, p) => sum + p.quantity, 0);
    let rand = Math.random() * totalWeight;
    for (const pack of available) {
      if (rand < pack.quantity) return pack;
      rand -= pack.quantity;
    }
    return available[available.length - 1];
  };

  /** Animate spinner */
  const animate = (time: number) => {
    const previousOffset = offsetRef.current;
    if (!spinStartTime.current) spinStartTime.current = time;
    const elapsed = time - spinStartTime.current;
    const t = Math.min(elapsed / spinDuration.current, 1);
    const eased = easeOutQuint(t); // Reverted to easeOutQuint
    const newOffset =
      startOffset.current + (targetOffset.current - startOffset.current) * eased;
    offsetRef.current = newOffset;
    setBuffer((prev) => [...prev]);

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
      const packIndex = Math.floor(offsetRef.current / packTotalWidth);
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
      }, 100); // <-- REDUCED DELAY
    }
  };

  /** Handle spin */
  const handleSpin = () => {
    if (spinning || confirmed) return;
    const selectedPack = pickWeightedRandomPack();
    if (!selectedPack) {
      setNoPacksAlert(true); // Use modal instead of alert
      return;
    }
    setShowPopup(false);
    setSelectedForDisplay(null);
    selectedPackRef.current = selectedPack;
    setSpinning(true);
    // Set duration to 8-12 seconds (10s +/- 2s)
    spinDuration.current = 8000 + Math.random() * 4000;
    startOffset.current = offsetRef.current;
    const allPacks = tempInventory;
    let singleCycle = allPacks.filter((p) => p.id !== selectedPack.id);
    singleCycle.push(selectedPack);
    const revolutions = 4 + Math.floor(Math.random() * 3);
    let animationBuffer = [...buffer];
    const revolutionCycles = Array.from(
      { length: revolutions },
      () => [...singleCycle]
    ).flat();
    animationBuffer = [...animationBuffer, ...revolutionCycles];
    const trailingPacks = [...allPacks, ...allPacks].slice(0, 10);
    animationBuffer = [...animationBuffer, ...trailingPacks];
    setBuffer(animationBuffer);
    const searchStartIndex = buffer.length;
    const revolutionEndIndex = buffer.length + revolutionCycles.length;
    let selectedIndex = -1;
    for (let i = revolutionEndIndex - 1; i >= searchStartIndex; i--) {
      if (animationBuffer[i].id === selectedPack.id) {
        selectedIndex = i;
        break;
      }
    }
    if (selectedIndex === -1) {
      console.error("Selected pack not found in animation buffer!");
      selectedIndex = revolutionEndIndex - 1;
    }
    const randomOffset = (Math.random() - 0.5) * 30;
    targetOffset.current = selectedIndex * packTotalWidth + randomOffset;
    spinStartTime.current = 0;
    lastTickPosition.current = Math.floor(offsetRef.current / packTotalWidth);
    requestRef.current = requestAnimationFrame(animate);
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    await confirmSession();
    setIsConfirming(false);
  };

  const isDraftComplete = packsSelectedOrder.length === numPacks;

  // Calculate the next player's name
  let nextPlayerName = "";
  if (players.length > 0 && !isDraftComplete) {
    const nextPlayerIndex = packsSelectedOrder.length % players.length;
    nextPlayerName = players[nextPlayerIndex]?.name || "";
  }

  const canSpin = !spinning && !!pickWeightedRandomPack() && !confirmed;
  const canUndo = packsSelectedOrder.length > 0 && !spinning && !confirmed;

  // New variable for button text
  const spinButtonText = () => {
    if (spinning) return "Spinning...";
    if (isDraftComplete) return "Draft Complete";
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
            className="overflow-hidden relative border border-gray-700 rounded-2xl bg-gray-800"
            style={{
              width: visibleWidth,
              height: 260,
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
              className="flex absolute top-0 left-0 h-full items-center"
              style={{
                transform: `translateX(${-offsetRef.current}px)`,
                transition: spinning ? "none" : "transform 0.3s ease-out",
                paddingLeft: `${visibleWidth / 2 - packWidth / 2}px`,
                gap: `${packGap}px`,
                transformStyle: "preserve-3d",
              }}
            >
              {buffer.map((pack, idx) => {
                const packPosition = idx * packTotalWidth;
                const distFromCenter = packPosition - offsetRef.current;
                const isCentered =
                  Math.abs(distFromCenter) < packTotalWidth / 2;

                // --- 3D Transform Calculations ---
                const clampedDist = Math.max(
                  -visibleWidth,
                  Math.min(visibleWidth, distFromCenter)
                );

                const rotationY = clampedDist / 60;
                const translationZ = -Math.abs(clampedDist) / 10;
                const scale = Math.max(
                  0.9,
                  1 - Math.abs(clampedDist) / 5000
                );

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
                    // Removed overflow-hidden to allow for 3D effects
                    className="flex-shrink-0 rounded-md transition-all duration-200 relative"
                    style={{
                      width: `${packWidth}px`,
                      height: "240px",
                      minWidth: `${packWidth}px`,
                      maxWidth: `${packWidth}px`,
                      transform: `
                        scale(${isCentered && justFinished ? scale * 1.03 : scale})
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
                      // Add transform-style to allow 3D children
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {/* This div will hold the pack and its shine */}
                    <div
                      className="relative w-full h-full"
                      style={{
                        transform: `rotateY(${rotationY * 0.1}deg)`, // Slight inner rotation
                        boxShadow: "inset 0 0 15px 5px rgba(0,0,0,0.3)", // Puffy shadow
                        borderRadius: "0.375rem", // matches parent
                      }}
                    >
                      <img
                        src={pack.imageUrl}
                        alt={pack.name}
                        className="w-full h-full object-cover rounded-md" // rounded-md to match
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://placehold.co/200x280/1F2937/FFF?text=No+Image";
                        }}
                      />
                      {/* Foil Shine Overlay */}
                      <div
                        className="absolute inset-0 rounded-md opacity-70 mix-blend-overlay"
                        style={{
                          background:
                            "linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)",
                          backgroundSize: "200% 100%",
                          // Animate the shine based on the pack's position
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
