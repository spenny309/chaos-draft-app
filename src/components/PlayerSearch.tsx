import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '../state/userStore';
import type { PublicProfile } from '../types';

interface PlayerSearchProps {
  value: string;
  onChange: (name: string, userId: string | null) => void;
  placeholder?: string;
}

export default function PlayerSearch({ value, onChange, placeholder = 'Player name…' }: PlayerSearchProps) {
  const { publicProfiles } = useUserStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length < 1
    ? []
    : publicProfiles.filter(u =>
        u.name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8);

  const handleSelect = (user: PublicProfile) => {
    onChange(user.name, user.uid);
    setOpen(false);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value, null); // clear userId link when typing freely
    setOpen(true);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(user => (
            <li
              key={user.uid}
              onMouseDown={() => handleSelect(user)}
              className="px-4 py-2 cursor-pointer hover:bg-gray-700 text-white text-sm"
            >
              {user.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
