import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegularDraftSetup from './RegularDraftSetup';
import RegularDraftPreview from './RegularDraftPreview';
import type { PackCatalogEntry, DraftFormat, DraftPlayer } from '../types';

type Step = 'setup' | 'preview' | 'saved';

interface RegularConfig {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
}

export default function DraftHub() {
  const [step, setStep] = useState<Step>('setup');
  const [config, setConfig] = useState<RegularConfig | null>(null);
  const navigate = useNavigate();

  const handleNext = (cfg: RegularConfig) => {
    setConfig(cfg);
    setStep('preview');
  };

  const handleStartOver = () => {
    setStep('setup');
    setConfig(null);
  };

  if (step === 'setup') {
    return <RegularDraftSetup onNext={handleNext} />;
  }

  if (step === 'preview' && config) {
    return (
      <RegularDraftPreview
        {...config}
        onBack={() => setStep('setup')}
        onSaved={() => setStep('saved')}
      />
    );
  }

  return (
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
  );
}
