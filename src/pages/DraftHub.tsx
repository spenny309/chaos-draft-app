import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionSetup from './SessionSetup';
import RegularDraftSetup from './RegularDraftSetup';
import RegularDraftPreview from './RegularDraftPreview';
import type { PackCatalogEntry, DraftFormat, DraftPlayer } from '../types';

type DraftMode = 'chaos' | 'regular';
type RegularStep = 'setup' | 'preview' | 'saved';

interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
}

export default function DraftHub() {
  const [mode, setMode] = useState<DraftMode>('chaos');
  const [regularStep, setRegularStep] = useState<RegularStep>('setup');
  const [regularConfig, setRegularConfig] = useState<RegularConfig | null>(null);
  const [_savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegularNext = (config: RegularConfig) => {
    setRegularConfig(config);
    setRegularStep('preview');
  };

  const handleSaved = (draftId: string) => {
    setSavedDraftId(draftId);
    setRegularStep('saved');
  };

  const handleStartOver = () => {
    setRegularStep('setup');
    setRegularConfig(null);
    setSavedDraftId(null);
  };

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex gap-2 border-b border-gray-700 pb-4">
        <button
          onClick={() => { setMode('chaos'); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'chaos' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          Chaos Draft
        </button>
        <button
          onClick={() => { setMode('regular'); setRegularStep('setup'); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'regular' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          Regular Draft
        </button>
      </div>

      {mode === 'chaos' && <SessionSetup />}

      {mode === 'regular' && regularStep === 'setup' && (
        <RegularDraftSetup onNext={handleRegularNext} />
      )}

      {mode === 'regular' && regularStep === 'preview' && regularConfig && (
        <RegularDraftPreview
          {...regularConfig}
          onBack={() => setRegularStep('setup')}
          onSaved={handleSaved}
        />
      )}

      {mode === 'regular' && regularStep === 'saved' && (
        <div className="max-w-md mx-auto text-center space-y-4 py-12">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-white">Draft Saved</h2>
          <p className="text-gray-300 text-sm">
            The draft preview has been saved. An admin can finalize it from the History tab, which will deduct packs from everyone's private inventories.
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
      )}
    </div>
  );
}
