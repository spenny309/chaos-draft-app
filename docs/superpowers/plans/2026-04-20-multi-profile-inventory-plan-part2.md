# Multi-Profile Inventory & Regular Draft Implementation Plan (Part 2: Tasks 13–23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is Part 2 of 2. See `2026-04-20-multi-profile-inventory-plan-part1.md` for Tasks 1–12.**

---

## Task 13: PackCatalogSearch component

**Files:**
- Create: `src/components/PackCatalogSearch.tsx`

- [ ] **Step 1: Create `src/components/PackCatalogSearch.tsx`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PackCatalogSearch.tsx
git commit -m "feat: add PackCatalogSearch typeahead component"
```

---

## Task 14: PlayerSearch component

**Files:**
- Create: `src/components/PlayerSearch.tsx`

- [ ] **Step 1: Create `src/components/PlayerSearch.tsx`**

```typescript
import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '../state/userStore';
import type { UserProfile } from '../types';

interface PlayerSearchProps {
  value: string;
  onChange: (name: string, userId: string | null) => void;
  placeholder?: string;
}

export default function PlayerSearch({ value, onChange, placeholder = 'Player name…' }: PlayerSearchProps) {
  const { allUsers } = useUserStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const approvedUsers = allUsers.filter(u => u.status === 'approved');
  const filtered = value.trim().length < 1
    ? []
    : approvedUsers.filter(u =>
        u.name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8);

  const handleSelect = (user: UserProfile) => {
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
              <span className="ml-2 text-gray-400 text-xs">{user.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PlayerSearch.tsx
git commit -m "feat: add PlayerSearch typeahead component"
```

---

## Task 15: Admin page — User Management and Pack Catalog

**Files:**
- Create: `src/pages/Admin.tsx`

- [ ] **Step 1: Create `src/pages/Admin.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useUserStore } from '../state/userStore';
import { usePackCatalogStore } from '../state/packCatalogStore';
import { useInventoryStore } from '../state/inventoryStore';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { UserProfile, PackCatalogEntry } from '../types';

type AdminSection = 'users' | 'catalog';

export default function Admin() {
  const [section, setSection] = useState<AdminSection>('users');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
      <div className="flex gap-2 border-b border-gray-700 pb-4">
        <button
          onClick={() => setSection('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'users' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          User Management
        </button>
        <button
          onClick={() => setSection('catalog')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'catalog' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          Pack Catalog
        </button>
      </div>

      {section === 'users' && <UserManagement />}
      {section === 'catalog' && <PackCatalogManagement />}
    </div>
  );
}

function UserManagement() {
  const { allUsers, isLoading, loadAllUsers, updateUserStatus } = useUserStore();

  useEffect(() => { loadAllUsers(); }, []);

  const statusBadge = (status: UserProfile['status']) => {
    const colors = { pending: 'bg-yellow-700 text-yellow-200', approved: 'bg-green-700 text-green-200', denied: 'bg-red-800 text-red-200' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status]}`}>{status}</span>;
  };

  if (isLoading) return <div className="text-gray-400">Loading users…</div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-200">Registered Users</h2>
      {allUsers.length === 0 && <p className="text-gray-400">No users found.</p>}
      {allUsers.map(user => (
        <div key={user.uid} className="bg-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-700">
          <div>
            <p className="text-white font-medium">{user.name}</p>
            <p className="text-gray-400 text-sm">{user.email}</p>
            <div className="mt-1">{statusBadge(user.status)}</div>
          </div>
          <div className="flex gap-2">
            {user.status !== 'approved' && (
              <button
                onClick={() => updateUserStatus(user.uid, 'approved')}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium"
              >
                Approve
              </button>
            )}
            {user.status !== 'denied' && user.role !== 'admin' && (
              <button
                onClick={() => updateUserStatus(user.uid, 'denied')}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium"
              >
                Deny
              </button>
            )}
            {user.status === 'denied' && (
              <button
                onClick={() => updateUserStatus(user.uid, 'pending')}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg font-medium"
              >
                Reset to Pending
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PackCatalogManagement() {
  const { entries, isLoading, loadEntries, addEntry, editEntry, deleteEntry } = usePackCatalogStore();
  const { packs: chaosPacks } = useInventoryStore();

  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<{ id: string; blockedBy: string[] } | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrationLog, setMigrationLog] = useState<string[]>([]);

  useEffect(() => { loadEntries(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newImageUrl.trim()) return;
    setSaving(true);
    await addEntry(newName.trim(), newImageUrl.trim());
    setNewName(''); setNewImageUrl('');
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    setSaving(true);
    await editEntry(id, { name: editName.trim(), imageUrl: editImageUrl.trim() });
    setEditId(null);
    setSaving(false);
  };

  const handleDeleteRequest = async (id: string) => {
    const result = await deleteEntry(id);
    if (result.blockedBy.length > 0) {
      setDeleteWarning({ id, blockedBy: result.blockedBy });
    }
  };

  const runMigration = async () => {
    setMigrationStatus('running');
    const log: string[] = [];

    try {
      // Step 1: Read all existing chaos packs
      const packsSnap = await getDocs(collection(db, 'packs'));
      const existingPacks = packsSnap.docs;
      log.push(`Found ${existingPacks.length} chaos packs.`);

      // Step 2: Seed packCatalog (deduplicate by name)
      const catalogMap = new Map<string, string>(); // name → catalogId
      const existingCatalogSnap = await getDocs(collection(db, 'packCatalog'));
      existingCatalogSnap.docs.forEach(d => {
        catalogMap.set((d.data().name as string).toLowerCase(), d.id);
      });

      for (const packDoc of existingPacks) {
        const packData = packDoc.data();
        const nameLower = (packData.name as string).toLowerCase();
        if (!catalogMap.has(nameLower)) {
          const ref = await addDoc(collection(db, 'packCatalog'), {
            name: packData.name,
            imageUrl: packData.imageUrl,
            createdAt: serverTimestamp(),
          });
          catalogMap.set(nameLower, ref.id);
          log.push(`Created catalog entry: ${packData.name}`);
        }
      }

      // Step 3: Add catalogId to each packs document
      const batch = writeBatch(db);
      for (const packDoc of existingPacks) {
        const packData = packDoc.data();
        if (!packData.catalogId) {
          const catalogId = catalogMap.get((packData.name as string).toLowerCase());
          if (catalogId) {
            batch.update(packDoc.ref, { catalogId });
          }
        }
      }
      await batch.commit();
      log.push('Updated chaos packs with catalogId references.');

      // Step 4: Update existing drafts with unified schema fields
      const draftsSnap = await getDocs(collection(db, 'drafts'));
      const draftBatch = writeBatch(db);
      for (const draftDoc of draftsSnap.docs) {
        const data = draftDoc.data();
        const updates: Record<string, unknown> = {};
        if (!data.type) updates.type = 'chaos';
        if (!data.status) updates.status = 'finalized';
        if (!data.createdBy && data.userId) updates.createdBy = data.userId;
        if (data.completedAt && !data.createdAt) updates.createdAt = data.completedAt;
        // Migrate players array to include userId: null
        if (Array.isArray(data.players)) {
          updates.players = data.players.map((p: Record<string, unknown>) => ({
            id: p.id,
            name: p.name,
            userId: p.userId ?? null,
            packs: p.packs ?? [],
          }));
        }
        if (Object.keys(updates).length > 0) draftBatch.update(draftDoc.ref, updates);
      }
      await draftBatch.commit();
      log.push(`Migrated ${draftsSnap.docs.length} draft records.`);

      // Step 5: Create users document for admin if missing
      log.push('Migration complete. Note: create your users document via the app login if not already done.');

      setMigrationLog(log);
      setMigrationStatus('done');
      loadEntries();
    } catch (err) {
      log.push(`ERROR: ${(err as Error).message}`);
      setMigrationLog(log);
      setMigrationStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Migration */}
      <div className="bg-gray-800 rounded-xl p-5 border border-yellow-700 space-y-3">
        <h2 className="text-lg font-semibold text-yellow-400">One-Time Migration</h2>
        <p className="text-gray-300 text-sm">
          Seeds packCatalog from existing chaos packs, adds catalogId references, and updates draft records to the unified schema. Safe to run only once.
        </p>
        <button
          onClick={runMigration}
          disabled={migrationStatus === 'running' || migrationStatus === 'done'}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
        >
          {migrationStatus === 'running' ? 'Running…' : migrationStatus === 'done' ? 'Done' : 'Run Migration'}
        </button>
        {migrationLog.length > 0 && (
          <ul className="text-xs text-gray-400 space-y-0.5 font-mono">
            {migrationLog.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        )}
      </div>

      {/* Add new entry */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">Add to Pack Catalog</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Pack name"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="url"
            value={newImageUrl}
            onChange={e => setNewImageUrl(e.target.value)}
            placeholder="Image URL"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="submit"
            disabled={saving || !newName.trim() || !newImageUrl.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
          >
            Add
          </button>
        </form>
      </div>

      {/* Catalog list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-200">Catalog Entries ({entries.length})</h2>
        {isLoading && <div className="text-gray-400">Loading…</div>}
        {entries.map(entry => (
          <div key={entry.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-start gap-4">
            <img
              src={entry.imageUrl}
              alt={entry.name}
              className="w-10 h-13 object-cover rounded"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x52/1F2937/FFF?text=?'; }}
            />
            {editId === entry.id ? (
              <div className="flex-1 flex flex-col gap-2">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={editImageUrl}
                  onChange={e => setEditImageUrl(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(entry.id)} disabled={saving} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">Save</button>
                  <button onClick={() => setEditId(null)} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded font-medium">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <p className="text-white font-medium">{entry.name}</p>
                <p className="text-gray-400 text-xs truncate max-w-xs">{entry.imageUrl}</p>
              </div>
            )}
            {editId !== entry.id && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => { setEditId(entry.id); setEditName(entry.name); setEditImageUrl(entry.imageUrl); }}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteRequest(entry.id)}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs rounded-lg font-medium"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete warning modal */}
      {deleteWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4 border border-red-700">
            <h3 className="text-lg font-bold text-red-400">Cannot Delete</h3>
            <p className="text-gray-300 text-sm">This catalog entry is referenced by live inventory items:</p>
            <ul className="text-sm text-gray-400 list-disc list-inside">
              {deleteWarning.blockedBy.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            <p className="text-gray-300 text-sm">Remove those inventory items first, then delete the catalog entry.</p>
            <button onClick={() => setDeleteWarning(null)} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat: add Admin page with user management, pack catalog, and migration"
```

---

## Task 16: Update Inventory.tsx — three-way selector

**Files:**
- Modify: `src/pages/Inventory.tsx`
- Create: `src/pages/PrivateInventory.tsx`
- Create: `src/pages/DraftInventory.tsx`

- [ ] **Step 1: Create `src/pages/PrivateInventory.tsx`**

```typescript
import { useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import PackCatalogSearch from '../components/PackCatalogSearch';
import type { PackCatalogEntry } from '../types';

export default function PrivateInventory() {
  const { myItems, isLoading, addOrUpdateItem, updateCount, deleteItem } = usePrivateInventoryStore();
  const { profile } = useUserStore();
  const [selectedEntry, setSelectedEntry] = useState<PackCatalogEntry | null>(null);
  const [addCount, setAddCount] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSelect = (entry: PackCatalogEntry) => {
    setSelectedEntry(entry);
    setAddCount('1');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !addCount) return;
    setIsAdding(true);
    await addOrUpdateItem(selectedEntry.id, selectedEntry.name, selectedEntry.imageUrl, Math.max(1, Number(addCount)));
    setSelectedEntry(null);
    setAddCount('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Private Inventory</h2>
        <p className="text-gray-400 text-sm">{profile?.name}</p>
      </div>

      {/* Add pack */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Add Packs</h3>
        <PackCatalogSearch onSelect={handleSelect} clearOnSelect={false} />
        {selectedEntry && (
          <form onSubmit={handleAdd} className="flex items-center gap-3 mt-2">
            <img src={selectedEntry.imageUrl} alt={selectedEntry.name} className="w-8 h-10 object-cover rounded" />
            <span className="text-white text-sm flex-1">{selectedEntry.name}</span>
            <input
              type="number"
              min="1"
              value={addCount}
              onChange={e => setAddCount(e.target.value)}
              className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isAdding}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
            >
              Add
            </button>
            <button type="button" onClick={() => setSelectedEntry(null)} className="px-2 py-1.5 text-gray-400 hover:text-white text-sm">✕</button>
          </form>
        )}
      </div>

      {/* Inventory grid */}
      {isLoading && <div className="text-gray-400">Loading…</div>}
      {!isLoading && myItems.length === 0 && (
        <p className="text-gray-400 text-center py-8">No packs in your private inventory yet.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {myItems.map(item => (
          <div key={item.id} className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden">
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full aspect-[3/4] object-cover"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x280/1F2937/FFF?text=No+Image'; }}
            />
            <div className="p-3 flex flex-col gap-2">
              <p className="text-white text-xs font-medium text-center truncate">{item.name}</p>
              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => updateCount(item.id, Math.max(0, item.count - 1))}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                >−</button>
                <span className="text-white text-sm font-semibold">{item.count}</span>
                <button
                  onClick={() => updateCount(item.id, item.count + 1)}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                >+</button>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-red-400 hover:text-red-300 text-xs text-center"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/DraftInventory.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import type { PrivateInventoryItem } from '../types';

interface AggregatedPack {
  catalogId: string;
  name: string;
  imageUrl: string;
  total: number;
  contributors: { userId: string; userName: string; count: number }[];
}

export default function DraftInventory() {
  const { allItems, isLoading, loadAllInventory } = usePrivateInventoryStore();
  const { allUsers, loadAllUsers } = useUserStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadAllInventory();
    loadAllUsers();
  }, []);

  const userNameMap = new Map(allUsers.map(u => [u.uid, u.name]));

  // Aggregate by catalogId
  const aggregated = new Map<string, AggregatedPack>();
  for (const item of allItems) {
    if (item.count <= 0) continue;
    const existing = aggregated.get(item.catalogId);
    const userName = userNameMap.get(item.ownerId) ?? 'Unknown';
    if (existing) {
      existing.total += item.count;
      existing.contributors.push({ userId: item.ownerId, userName, count: item.count });
    } else {
      aggregated.set(item.catalogId, {
        catalogId: item.catalogId,
        name: item.name,
        imageUrl: item.imageUrl,
        total: item.count,
        contributors: [{ userId: item.ownerId, userName, count: item.count }],
      });
    }
  }

  const packs = [...aggregated.values()].sort((a, b) => {
    if (a.total > 0 && b.total === 0) return -1;
    if (a.total === 0 && b.total > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Draft Inventory</h2>
        <p className="text-gray-400 text-sm">{packs.length} pack types · {[...aggregated.values()].reduce((s, p) => s + p.total, 0)} total</p>
      </div>
      <p className="text-gray-400 text-sm">Combined view of all users' private inventories. Read-only.</p>

      {isLoading && <div className="text-gray-400">Loading…</div>}
      {!isLoading && packs.length === 0 && (
        <p className="text-gray-400 text-center py-8">No packs in any private inventory yet.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {packs.map(pack => (
          <div
            key={pack.catalogId}
            className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col overflow-hidden cursor-pointer"
            onClick={() => setExpanded(expanded === pack.catalogId ? null : pack.catalogId)}
          >
            <img
              src={pack.imageUrl}
              alt={pack.name}
              className="w-full aspect-[3/4] object-cover"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x280/1F2937/FFF?text=No+Image'; }}
            />
            <div className="p-3 space-y-1">
              <p className="text-white text-xs font-medium text-center truncate">{pack.name}</p>
              <p className="text-blue-400 text-sm font-bold text-center">{pack.total}</p>
              {expanded === pack.catalogId && (
                <div className="mt-2 space-y-1 border-t border-gray-700 pt-2">
                  {pack.contributors.sort((a, b) => b.count - a.count).map(c => (
                    <div key={c.userId} className="flex justify-between text-xs text-gray-300">
                      <span>{c.userName}</span>
                      <span className="font-semibold">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the three-way selector to `src/pages/Inventory.tsx`**

At the top of `Inventory.tsx`, add imports and a selector. Insert this immediately before the existing `return` statement's opening `<div>`:

Add these imports at the top of the file:
```typescript
import { useState } from 'react'; // already imported, skip if present
import { useUserStore } from '../state/userStore';
import PrivateInventory from './PrivateInventory';
import DraftInventory from './DraftInventory';
```

At the top of the `Inventory` component function body, add:
```typescript
const { profile } = useUserStore();
const isAdmin = profile?.role === 'admin';
const [inventoryTab, setInventoryTab] = useState<'chaos' | 'draft' | 'private'>(
  isAdmin ? 'chaos' : 'private'
);
```

Replace the outermost return with:
```typescript
return (
  <div className="space-y-6 max-w-6xl mx-auto">
    {/* Inventory type selector */}
    <div className="flex gap-2 border-b border-gray-700 pb-4">
      {isAdmin && (
        <button
          onClick={() => setInventoryTab('chaos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            inventoryTab === 'chaos' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          Chaos Inventory
        </button>
      )}
      <button
        onClick={() => setInventoryTab('draft')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          inventoryTab === 'draft' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
        }`}
      >
        Draft Inventory
      </button>
      <button
        onClick={() => setInventoryTab('private')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          inventoryTab === 'private' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
        }`}
      >
        Private Inventory
      </button>
    </div>

    {inventoryTab === 'draft' && <DraftInventory />}
    {inventoryTab === 'private' && <PrivateInventory />}
    {inventoryTab === 'chaos' && isAdmin && <ChaosInventory />}
  </div>
);
```

Wrap the existing inventory JSX into a `ChaosInventory` component at the bottom of the file. Replace `export default function Inventory()` with a wrapper that exports the selector, and move the existing body into a new function:

```typescript
function ChaosInventory() {
  // ... all the existing Inventory component body and JSX goes here ...
  // Change all addPack calls to include catalogId from the PackCatalogSearch selection
}
```

- [ ] **Step 4: Update the "Add Pack" form inside `ChaosInventory` to use `PackCatalogSearch`**

Replace the existing name + imageUrl inputs in the add-pack form with:

```typescript
import PackCatalogSearch from '../components/PackCatalogSearch';
// ...
const [selectedCatalogEntry, setSelectedCatalogEntry] = useState<{ id: string; name: string; imageUrl: string } | null>(null);

// In the form, replace the name/imageUrl inputs with:
<PackCatalogSearch
  onSelect={entry => {
    setSelectedCatalogEntry(entry);
    setNewPackName(entry.name);
    setNewPackImageUrl(entry.imageUrl);
  }}
  clearOnSelect={false}
  placeholder="Search pack catalog to add…"
/>
{selectedCatalogEntry && (
  <div className="flex items-center gap-2 text-sm text-gray-300">
    <img src={selectedCatalogEntry.imageUrl} className="w-6 h-8 object-cover rounded" />
    {selectedCatalogEntry.name}
  </div>
)}

// In handleAdd, pass catalogId:
await addPack({
  catalogId: selectedCatalogEntry!.id,
  name: newPackName,
  imageUrl: newPackImageUrl,
  inPerson,
  inTransit,
});
setSelectedCatalogEntry(null);
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Inventory.tsx src/pages/PrivateInventory.tsx src/pages/DraftInventory.tsx
git commit -m "feat: add three-way inventory selector with Private and Draft inventory views"
```

---

## Task 17: Update SessionSetup.tsx — player typeahead

**Files:**
- Modify: `src/pages/SessionSetup.tsx`

- [ ] **Step 1: Import `PlayerSearch` and `useUserStore` in `SessionSetup.tsx`**

Add at the top:
```typescript
import PlayerSearch from '../components/PlayerSearch';
import { useUserStore } from '../state/userStore';
```

- [ ] **Step 2: Add userId tracking state per player field**

In `SessionSetup`'s state, add a parallel array for user IDs. Find where player names are tracked (e.g. `playerNames` state) and add:

```typescript
const [playerUserIds, setPlayerUserIds] = useState<(string | null)[]>(
  Array(numPlayers).fill(null)
);
```

- [ ] **Step 3: Replace each player name `<input>` with `<PlayerSearch>`**

Find the player name input (likely rendered in a `Array.from({ length: numPlayers }).map(...)` block) and replace:
```typescript
<input
  type="text"
  value={playerNames[i]}
  onChange={e => { /* existing handler */ }}
  // ...
/>
```
With:
```typescript
<PlayerSearch
  value={playerNames[i] ?? ''}
  onChange={(name, userId) => {
    const names = [...playerNames];
    names[i] = name;
    setPlayerNames(names);
    const ids = [...playerUserIds];
    ids[i] = userId;
    setPlayerUserIds(ids);
  }}
  placeholder={`Player ${i + 1} name…`}
/>
```

- [ ] **Step 4: Pass `playerUserIds` to `initializeSession`**

Find the form submit / start draft handler and update the `initializeSession` call:
```typescript
initializeSession(numPlayers, playerNames, playerUserIds);
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionSetup.tsx
git commit -m "feat: add player typeahead with user account linking in session setup"
```

---

## Task 18: RegularDraftSetup component

**Files:**
- Create: `src/pages/RegularDraftSetup.tsx`

- [ ] **Step 1: Create `src/pages/RegularDraftSetup.tsx`**

```typescript
import { useState } from 'react';
import PackCatalogSearch from '../components/PackCatalogSearch';
import PlayerSearch from '../components/PlayerSearch';
import type { PackCatalogEntry, DraftFormat, DraftPlayer } from '../types';
import { DEFAULT_PACKS_PER_PERSON } from '../types';

interface RegularDraftSetupProps {
  onNext: (config: {
    players: DraftPlayer[];
    sets: PackCatalogEntry[];
    format: DraftFormat;
    packsPerPerson: number;
  }) => void;
}

const FORMATS: DraftFormat[] = ['Regular Draft', 'Mobius Draft', 'Sealed', 'Team Sealed'];

export default function RegularDraftSetup({ onNext }: RegularDraftSetupProps) {
  const [numPlayers, setNumPlayers] = useState(4);
  const [players, setPlayers] = useState<DraftPlayer[]>(
    Array.from({ length: 4 }, (_, i) => ({ id: `player-${i + 1}`, name: '', userId: null }))
  );
  const [sets, setSets] = useState<PackCatalogEntry[]>([]);
  const [format, setFormat] = useState<DraftFormat>('Regular Draft');
  const [packsPerPerson, setPacksPerPerson] = useState(DEFAULT_PACKS_PER_PERSON['Regular Draft']);

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

  const handleFormatChange = (f: DraftFormat) => {
    setFormat(f);
    setPacksPerPerson(DEFAULT_PACKS_PER_PERSON[f]);
  };

  const handleAddSet = (entry: PackCatalogEntry) => {
    if (!sets.find(s => s.id === entry.id)) setSets(prev => [...prev, entry]);
  };

  const handleRemoveSet = (id: string) => setSets(prev => prev.filter(s => s.id !== id));

  const totalPacks = numPlayers * packsPerPerson;
  const packsPerSet = sets.length > 0 ? (totalPacks / sets.length).toFixed(1) : '—';
  const isRounded = sets.length > 0 && (totalPacks % sets.length !== 0);

  const canProceed =
    players.every(p => p.name.trim().length > 0) &&
    sets.length > 0 &&
    packsPerPerson > 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-white">Configure Regular Draft</h2>

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

      {/* Format */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
        <h3 className="font-semibold text-gray-200">Format</h3>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map(f => (
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

      {/* Sets */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
        <h3 className="font-semibold text-gray-200">Sets to Draft</h3>
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
      </div>

      {/* Packs per person */}
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
          {sets.length > 0 && (
            <> · Per set: <span className={`font-semibold ${isRounded ? 'text-yellow-400' : 'text-white'}`}>{packsPerSet}</span>
            {isRounded && <span className="text-yellow-400"> (will be rounded)</span>}</>
          )}
        </div>
      </div>

      <button
        onClick={() => onNext({ players, sets, format, packsPerPerson })}
        disabled={!canProceed}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-base transition-all"
      >
        Preview Allocation →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/RegularDraftSetup.tsx
git commit -m "feat: add RegularDraftSetup component"
```

---

## Task 19: RegularDraftPreview component — allocation preview with manual overrides

**Files:**
- Create: `src/pages/RegularDraftPreview.tsx`

- [ ] **Step 1: Create `src/pages/RegularDraftPreview.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { distributePacksAcrossSets } from '../utils/allocationAlgorithm';
import type { PackCatalogEntry, DraftFormat, DraftPlayer, DraftAllocationEntry } from '../types';

interface RegularDraftPreviewProps {
  players: DraftPlayer[];
  sets: PackCatalogEntry[];
  format: DraftFormat;
  packsPerPerson: number;
  onBack: () => void;
  onSaved: (draftId: string) => void;
}

interface OverrideEntry {
  userId: string;
  userName: string;
  catalogId: string;
  name: string;
  available: number;
  count: number;
}

export default function RegularDraftPreview({
  players, sets, format, packsPerPerson, onBack, onSaved,
}: RegularDraftPreviewProps) {
  const { allItems, loadAllInventory } = usePrivateInventoryStore();
  const { allUsers, loadAllUsers } = useUserStore();
  const { computePreview, savePreview, wasRounded, previewAllocations } = useRegularDraftStore();
  const [overrides, setOverrides] = useState<Map<string, OverrideEntry[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    Promise.all([loadAllInventory(), loadAllUsers()]);
  }, []);

  useEffect(() => {
    if (allItems.length === 0 || allUsers.length === 0) return;

    // Enrich contributor names
    const userMap = new Map(allUsers.map(u => [u.uid, u.name]));

    const { allocations } = computePreview(
      { players, sets, format, packsPerPerson },
      allItems
    );

    // Build overrides state from computed allocations
    const newOverrides = new Map<string, OverrideEntry[]>();
    const totalPacks = players.length * packsPerPerson;
    const { counts } = distributePacksAcrossSets(totalPacks, sets.length);

    allocations.forEach((allocation, idx) => {
      // Build full contributor list: all users who have packs of this set
      const itemsForSet = allItems.filter(
        item => item.catalogId === allocation.catalogId && item.count > 0
      );

      const allContributors: OverrideEntry[] = itemsForSet.map(item => {
        const existing = allocation.contributions.find(c => c.userId === item.ownerId);
        return {
          userId: item.ownerId,
          userName: userMap.get(item.ownerId) ?? item.ownerId,
          catalogId: allocation.catalogId,
          name: allocation.name,
          available: item.count,
          count: existing?.count ?? 0,
        };
      });

      newOverrides.set(allocation.catalogId, allContributors);
    });

    setOverrides(newOverrides);
  }, [allItems.length, allUsers.length]);

  const handleCountChange = (catalogId: string, userId: string, rawValue: string) => {
    const value = Math.max(0, parseInt(rawValue) || 0);
    setOverrides(prev => {
      const next = new Map(prev);
      const entries = next.get(catalogId) ?? [];
      next.set(
        catalogId,
        entries.map(e => e.userId === userId ? { ...e, count: value } : e)
      );
      return next;
    });
  };

  const validate = (): boolean => {
    const errors = new Map<string, string>();
    const totalPacks = players.length * packsPerPerson;
    const { counts } = distributePacksAcrossSets(totalPacks, sets.length);

    sets.forEach((set, idx) => {
      const entries = overrides.get(set.id) ?? [];
      const total = entries.reduce((s, e) => s + e.count, 0);
      const needed = counts[idx];
      if (total !== needed) {
        errors.set(set.id, `Total must equal ${needed} (currently ${total})`);
      }
      const overAllocated = entries.find(e => e.count > e.available);
      if (overAllocated) {
        errors.set(set.id, `${overAllocated.userName} only has ${overAllocated.available} packs`);
      }
    });

    setValidationErrors(errors);
    return errors.size === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const flatAllocation: DraftAllocationEntry[] = [];
    for (const entries of overrides.values()) {
      for (const entry of entries) {
        if (entry.count > 0) {
          flatAllocation.push({
            userId: entry.userId,
            userName: entry.userName,
            catalogId: entry.catalogId,
            name: entry.name,
            count: entry.count,
          });
        }
      }
    }

    try {
      const draftId = await savePreview(
        { players, sets, format, packsPerPerson },
        previewAllocations,
        flatAllocation
      );
      onSaved(draftId);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    const { allocations } = computePreview(
      { players, sets, format, packsPerPerson },
      allItems
    );
    const userMap = new Map(allUsers.map(u => [u.uid, u.name]));
    const newOverrides = new Map<string, OverrideEntry[]>();

    allocations.forEach(allocation => {
      const itemsForSet = allItems.filter(
        item => item.catalogId === allocation.catalogId && item.count > 0
      );
      newOverrides.set(allocation.catalogId, itemsForSet.map(item => {
        const existing = allocation.contributions.find(c => c.userId === item.ownerId);
        return {
          userId: item.ownerId,
          userName: userMap.get(item.ownerId) ?? item.ownerId,
          catalogId: allocation.catalogId,
          name: allocation.name,
          available: item.count,
          count: existing?.count ?? 0,
        };
      }));
    });

    setOverrides(newOverrides);
    setValidationErrors(new Map());
  };

  const totalPacks = players.length * packsPerPerson;
  const { counts } = distributePacksAcrossSets(totalPacks, sets.length);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h2 className="text-xl font-bold text-white">Pack Allocation Preview</h2>
      </div>

      {wasRounded && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
          The total packs don't divide evenly across sets. Counts have been rounded using the largest-remainder method.
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-sm text-gray-300 space-y-1">
        <p><span className="text-gray-400">Format:</span> <span className="text-white font-medium">{format}</span></p>
        <p><span className="text-gray-400">Players:</span> <span className="text-white font-medium">{players.map(p => p.name).join(', ')}</span></p>
        <p><span className="text-gray-400">Packs per person:</span> <span className="text-white font-medium">{packsPerPerson} ({totalPacks} total)</span></p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleResetToDefault}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg"
        >
          Reset to Algorithm Default
        </button>
      </div>

      {sets.map((set, idx) => {
        const entries = overrides.get(set.id) ?? [];
        const setTotal = entries.reduce((s, e) => s + e.count, 0);
        const needed = counts[idx];
        const error = validationErrors.get(set.id);
        const setAlloc = previewAllocations.find(a => a.catalogId === set.id);

        return (
          <div key={set.id} className={`bg-gray-800 rounded-xl border p-5 space-y-4 ${error ? 'border-red-600' : 'border-gray-700'}`}>
            <div className="flex items-center gap-3">
              <img src={set.imageUrl} alt={set.name} className="w-10 h-13 object-cover rounded" />
              <div className="flex-1">
                <h3 className="text-white font-semibold">{set.name}</h3>
                <p className="text-gray-400 text-sm">
                  {setTotal}/{needed} packs allocated
                  {setAlloc && setAlloc.shortfall > 0 && (
                    <span className="text-red-400 ml-2">· shortage: {setAlloc.shortfall}</span>
                  )}
                </p>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {entries.length === 0 && (
              <p className="text-gray-400 text-sm">No one has packs of this set in their private inventory.</p>
            )}

            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.userId} className="flex items-center gap-3">
                  <span className="text-gray-300 text-sm flex-1">{entry.userName}</span>
                  <span className="text-gray-500 text-xs">({entry.available} available)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCountChange(set.id, entry.userId, String(Math.max(0, entry.count - 1)))}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                    >−</button>
                    <input
                      type="number"
                      min="0"
                      max={entry.available}
                      value={entry.count}
                      onChange={e => handleCountChange(set.id, entry.userId, e.target.value)}
                      className="w-14 px-1 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleCountChange(set.id, entry.userId, String(Math.min(entry.available, entry.count + 1)))}
                      className="w-6 h-6 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-bold"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button
        onClick={handleSave}
        disabled={saving || validationErrors.size > 0}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold rounded-xl text-base"
      >
        {saving ? 'Saving…' : 'Save Preview'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/RegularDraftPreview.tsx
git commit -m "feat: add RegularDraftPreview with manual allocation overrides and validation"
```

---

## Task 20: DraftHub — unified draft tab

**Files:**
- Create: `src/pages/DraftHub.tsx`

- [ ] **Step 1: Create `src/pages/DraftHub.tsx`**

```typescript
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
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/DraftHub.tsx
git commit -m "feat: add DraftHub with chaos/regular mode selector and multi-step regular draft flow"
```

---

## Task 21: Update DraftHistory.tsx — unified schema and finalize button

**Files:**
- Modify: `src/pages/DraftHistory.tsx`

- [ ] **Step 1: Add imports and type updates**

At the top of `DraftHistory.tsx`, replace the existing type imports from `draftHistoryStore` with the unified `Draft` type from `../types`:

```typescript
import { useDraftHistoryStore } from '../state/draftHistoryStore';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';
import { useUserStore } from '../state/userStore';
import type { Draft } from '../types';
```

- [ ] **Step 2: Add a type-filter dropdown**

At the top of the rendered output, before the draft list, add:

```typescript
const [typeFilter, setTypeFilter] = useState<string>('all');
// ...
const filtered = typeFilter === 'all'
  ? drafts
  : drafts.filter(d => d.type === typeFilter);
```

Render the filter:
```typescript
<div className="flex items-center gap-3 mb-4">
  <label className="text-gray-400 text-sm">Filter:</label>
  <select
    value={typeFilter}
    onChange={e => setTypeFilter(e.target.value)}
    className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
  >
    <option value="all">All Drafts</option>
    <option value="chaos">Chaos</option>
    <option value="regular">Regular</option>
    <option value="mobius">Mobius</option>
    <option value="sealed">Sealed</option>
    <option value="team-sealed">Team Sealed</option>
  </select>
</div>
```

- [ ] **Step 3: Add a type badge to each draft card**

In the draft card header area, add a badge:

```typescript
const typeBadgeColors: Record<string, string> = {
  chaos: 'bg-purple-700 text-purple-200',
  regular: 'bg-blue-700 text-blue-200',
  mobius: 'bg-green-700 text-green-200',
  sealed: 'bg-yellow-700 text-yellow-200',
  'team-sealed': 'bg-orange-700 text-orange-200',
};

// In each draft card:
<span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColors[draft.type] ?? 'bg-gray-700 text-gray-300'}`}>
  {draft.type.charAt(0).toUpperCase() + draft.type.slice(1).replace('-', ' ')}
</span>
{draft.status === 'preview' && (
  <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-800 text-yellow-200">Preview</span>
)}
```

- [ ] **Step 4: Render regular draft cards**

For regular draft types (`draft.type !== 'chaos'`), display the sets and allocation instead of the spinning-wheel pack list:

```typescript
{draft.type !== 'chaos' && draft.sets && (
  <div className="space-y-2">
    <p className="text-gray-400 text-sm font-medium">Sets:</p>
    {draft.sets.map(s => (
      <div key={s.catalogId} className="flex items-center gap-2 text-sm text-gray-300">
        <img src={s.imageUrl} alt={s.name} className="w-5 h-6 object-cover rounded" />
        <span>{s.name}</span>
        <span className="text-gray-500">({s.totalNeeded} packs)</span>
      </div>
    ))}
    {draft.allocation && draft.allocation.length > 0 && (
      <div className="mt-3">
        <p className="text-gray-400 text-sm font-medium mb-1">Allocation:</p>
        {draft.allocation.map((a, i) => (
          <div key={i} className="flex justify-between text-xs text-gray-300">
            <span>{a.userName} — {a.name}</span>
            <span className="font-semibold">{a.count}</span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Add Finalize button for admin on preview drafts**

```typescript
import { useUserStore } from '../state/userStore';
import { useRegularDraftStore } from '../state/regularDraftStore';
import { usePrivateInventoryStore } from '../state/privateInventoryStore';

// In the component:
const { profile } = useUserStore();
const { finalizeDraft } = useRegularDraftStore();
const { batchDeduct } = usePrivateInventoryStore();
const [finalizing, setFinalizing] = useState<string | null>(null);

const handleFinalize = async (draft: Draft) => {
  if (!draft.allocation) return;
  setFinalizing(draft.id);
  try {
    await batchDeduct(draft.allocation);
    await finalizeDraft(draft.id, draft.allocation);
    await loadDrafts();
  } finally {
    setFinalizing(null);
  }
};

// In the draft card, after the content:
{profile?.role === 'admin' && draft.status === 'preview' && draft.type !== 'chaos' && (
  <button
    onClick={() => handleFinalize(draft)}
    disabled={finalizing === draft.id}
    className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
  >
    {finalizing === draft.id ? 'Finalizing…' : 'Finalize Draft'}
  </button>
)}
```

- [ ] **Step 6: Update `loadDrafts` call to not pass userId** (already fixed in Task 8; just verify the component calls `loadDrafts()` without arguments)

- [ ] **Step 7: Commit**

```bash
git add src/pages/DraftHistory.tsx
git commit -m "feat: update DraftHistory for unified schema, type badges, regular draft cards, finalize button"
```

---

## Post-Implementation Checklist

- [ ] Set `VITE_ADMIN_EMAIL` in `.env` to your email address
- [ ] Install and configure the Firebase Trigger Email extension in the Firebase console:
  - Go to Firebase Console → Extensions → "Trigger Email from Firestore"
  - Configure with SMTP credentials (e.g. Gmail app password, or SendGrid)
  - Set the collection to `mail`
- [ ] Log in as your admin account — `userStore.createProfile` will auto-create your `users` document with `role: admin` since your email matches `VITE_ADMIN_EMAIL`
- [ ] Run the migration from Admin → Pack Catalog → "Run Migration"
- [ ] Deploy updated Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Test new user registration: register a second account, confirm pending screen appears, approve from admin panel

---

*End of implementation plan.*
