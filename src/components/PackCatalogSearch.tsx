import { useState, useRef, useEffect } from 'react';
import { usePackCatalogStore } from '../state/packCatalogStore';
import type { PackCatalogEntry } from '../types';

interface PackCatalogSearchProps {
  onSelect: (entry: PackCatalogEntry) => void;
  placeholder?: string;
  clearOnSelect?: boolean;
}

export default function PackCatalogSearch({
  onSelect,
  placeholder = 'Search pack catalog…',
  clearOnSelect = true,
}: PackCatalogSearchProps) {
  const { entries } = usePackCatalogStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim().length < 1
    ? []
    : entries.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);

  const handleSelect = (entry: PackCatalogEntry) => {
    onSelect(entry);
    if (clearOnSelect) setQuery('');
    setOpen(false);
  };

  // Close dropdown on outside click
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
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filtered.map(entry => (
            <li
              key={entry.id}
              onMouseDown={() => handleSelect(entry)}
              className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-700"
            >
              <img
                src={entry.imageUrl}
                alt={entry.name}
                className="w-8 h-10 object-cover rounded"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/32x40/1F2937/FFF?text=?'; }}
              />
              <span className="text-white text-sm">{entry.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length > 0 && filtered.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-400 text-sm">
          No packs found for "{query}"
        </div>
      )}
    </div>
  );
}
