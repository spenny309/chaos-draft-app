import { useState } from 'react';
import PackCatalogSearch from '../components/PackCatalogSearch';
import PlayerSearch from '../components/PlayerSearch';
import { useInventoryStore } from '../state/inventoryStore';
import { useCubeStore } from '../state/cubeStore';
import type { PackCatalogEntry, DraftFormat, DraftPlayer } from '../types';
import { DEFAULT_PACKS_PER_PERSON } from '../types';

type SetupFormat = 'Chaos Draft' | DraftFormat;

const ALL_FORMATS: SetupFormat[] = [
  'Chaos Draft',
  'Regular Draft',
  'Mobius Draft',
  'Sealed',
  'Team Sealed',
];

const DEFAULT_PLAYERS: Partial<Record<SetupFormat, number>> = {
  'Team Sealed': 6,
};

interface RegularDraftSetupProps {
  onNext: (config: {
    players: DraftPlayer[];
    sets: PackCatalogEntry[];
    format: DraftFormat;
    packsPerPerson: number;
    cubeId?: string;
    cubeName?: string;
    cubeImageUrl?: string;
    cubeExternalUrl?: string;
  }) => void;
  onStartChaos: (players: DraftPlayer[]) => void;
}

export default function RegularDraftSetup({ onNext, onStartChaos }: RegularDraftSetupProps) {
  const packs = useInventoryStore(s => s.packs);
  const { cubes } = useCubeStore();

  const [numPlayers, setNumPlayers] = useState(4);
  const [players, setPlayers] = useState<DraftPlayer[]>(
    Array.from({ length: 4 }, (_, i) => ({ id: `player-${i + 1}`, name: '', userId: null }))
  );
  const [format, setFormat] = useState<SetupFormat>('Chaos Draft');
  const [sets, setSets] = useState<PackCatalogEntry[]>([]);
  const [packsPerPerson, setPacksPerPerson] = useState(DEFAULT_PACKS_PER_PERSON['Regular Draft']);
  const [source, setSource] = useState<'sets' | 'cube'>('sets');
  const [selectedCubeId, setSelectedCubeId] = useState<string | null>(null);
  const [selectedCubeName, setSelectedCubeName] = useState<string | null>(null);
  const [selectedCubeImageUrl, setSelectedCubeImageUrl] = useState<string | null>(null);
  const [selectedCubeExternalUrl, setSelectedCubeExternalUrl] = useState<string | null>(null);

  const isChaos = format === 'Chaos Draft';

  const handleNumPlayersChange = (n: number) => {
    setNumPlayers(n);
    setPlayers(prev => {
      const next = [...prev];
      while (next.length < n) next.push({ id: `player-${next.length + 1}`, name: '', userId: null });
      return next.slice(0, n);
    });
  };

  const handlePlayerChange = (i: number, name: string, userId: string | null) => {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, name, userId } : p));
  };

  const handleFormatChange = (f: SetupFormat) => {
    setFormat(f);
    if (f !== 'Chaos Draft') setPacksPerPerson(DEFAULT_PACKS_PER_PERSON[f as DraftFormat]);
    if (f === 'Chaos Draft') {
      setSource('sets');
      setSelectedCubeId(null);
      setSelectedCubeName(null);
      setSelectedCubeImageUrl(null);
      setSelectedCubeExternalUrl(null);
    }
    const defaultPlayers = DEFAULT_PLAYERS[f];
    if (defaultPlayers) handleNumPlayersChange(defaultPlayers);
  };

  const handleAddSet = (entry: PackCatalogEntry) => {
    if (!sets.find(s => s.id === entry.id)) setSets(prev => [...prev, entry]);
  };

  const handleRemoveSet = (id: string) => setSets(prev => prev.filter(s => s.id !== id));

  const handleSelectCube = (id: string, name: string, imageUrl?: string, externalUrl?: string) => {
    setSelectedCubeId(id);
    setSelectedCubeName(name);
    setSelectedCubeImageUrl(imageUrl ?? null);
    setSelectedCubeExternalUrl(externalUrl ?? null);
  };

  const handleSubmit = () => {
    if (isChaos) {
      const namedPlayers = players.map((p, i) => ({
        ...p,
        name: p.name.trim() || `Player ${i + 1}`,
      }));
      onStartChaos(namedPlayers);
    } else {
      onNext({
        players,
        sets: source === 'sets' ? sets : [],
        format: format as DraftFormat,
        packsPerPerson,
        cubeId: source === 'cube' ? (selectedCubeId ?? undefined) : undefined,
        cubeName: source === 'cube' ? (selectedCubeName ?? undefined) : undefined,
        cubeImageUrl: source === 'cube' ? (selectedCubeImageUrl ?? undefined) : undefined,
        cubeExternalUrl: source === 'cube' ? (selectedCubeExternalUrl ?? undefined) : undefined,
      });
    }
  };

  const totalPacks = numPlayers * packsPerPerson;
  const packsPerSet = sets.length > 0 ? (totalPacks / sets.length).toFixed(1) : '—';
  const isRounded = sets.length > 0 && totalPacks % sets.length !== 0;

  const canProceed = players.every(p => p.name.trim().length > 0) && (
    isChaos ||
    (source === 'sets' && sets.length > 0 && packsPerPerson > 0) ||
    (source === 'cube' && selectedCubeId != null && packsPerPerson > 0)
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-white">New Draft</h2>

      {/* Format */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
        <h3 className="font-semibold text-gray-200">Format</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_FORMATS.map(f => (
            <button
              key={f}
              onClick={() => handleFormatChange(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                format === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* No packs warning (chaos only) */}
      {isChaos && packs.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-yellow-700 text-center space-y-1">
          <p className="text-yellow-400 font-semibold">No Packs in Inventory</p>
          <p className="text-gray-400 text-sm">Add packs to the Chaos Inventory before starting a chaos draft.</p>
        </div>
      )}

      {/* Players */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-200">Players</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => handleNumPlayersChange(Math.max(2, numPlayers - 1))} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">−</button>
            <span className="text-white font-semibold w-4 text-center">{numPlayers}</span>
            <button onClick={() => handleNumPlayersChange(Math.min(16, numPlayers + 1))} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">+</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {players.map((player, i) => (
            <PlayerSearch
              key={player.id}
              value={player.name}
              onChange={(name, userId) => handlePlayerChange(i, name, userId)}
              placeholder={`Player ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Card Source (non-chaos only) */}
      {!isChaos && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-200">Card Source</h3>
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              <button
                onClick={() => setSource('sets')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  source === 'sets' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Sets
              </button>
              <button
                onClick={() => setSource('cube')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  source === 'cube' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Cube
              </button>
            </div>
          </div>

          {source === 'sets' && (
            <>
              <PackCatalogSearch onSelect={handleAddSet} placeholder="Add a set…" />
              {sets.length > 0 && (
                <div className="space-y-2 mt-2">
                  {sets.map(s => (
                    <div key={s.id} className="flex items-center gap-3 bg-gray-700 rounded-lg px-3 py-2">
                      <img src={s.imageUrl} alt={s.name} className="w-6 h-8 object-cover rounded" />
                      <span className="text-white text-sm flex-1">{s.name}</span>
                      <button onClick={() => handleRemoveSet(s.id)} className="text-gray-400 hover:text-red-400 text-sm">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {source === 'cube' && (
            <div className="space-y-2">
              {cubes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No cubes found. Add one in the Admin panel.</p>
              ) : (
                cubes.map(cube => (
                  <button
                    key={cube.id}
                    onClick={() => handleSelectCube(cube.id, cube.name, cube.imageUrl, cube.externalUrl)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedCubeId === cube.id
                        ? 'bg-blue-700 border border-blue-500 text-white'
                        : 'bg-gray-700 border border-transparent text-gray-200 hover:bg-gray-600'
                    }`}
                  >
                    {cube.imageUrl && (
                      <img src={cube.imageUrl} alt={cube.name} className="w-8 h-8 object-cover rounded" />
                    )}
                    <span className="flex-1 text-sm font-medium">{cube.name}</span>
                    {selectedCubeId === cube.id && (
                      <span className="text-blue-300 text-base">✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Packs per person (non-chaos only) */}
      {!isChaos && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-200">Packs Per Person</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setPacksPerPerson(Math.max(1, packsPerPerson - 1))} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">−</button>
              <span className="text-white font-semibold w-6 text-center">{packsPerPerson}</span>
              <button onClick={() => setPacksPerPerson(packsPerPerson + 1)} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">+</button>
            </div>
          </div>
          <div className="text-gray-400 text-sm">
            Total: <span className="text-white font-semibold">{totalPacks} packs</span>
            {source === 'sets' && sets.length > 0 && (
              <> · Per set: <span className={`font-semibold ${isRounded ? 'text-yellow-400' : 'text-white'}`}>{packsPerSet}</span>
              {isRounded && <span className="text-yellow-400"> (will be rounded)</span>}</>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canProceed}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-base transition-all"
      >
        {isChaos ? 'Start Draft' : 'Preview Allocation →'}
      </button>
    </div>
  );
}
