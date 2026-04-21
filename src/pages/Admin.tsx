import { useEffect, useState } from 'react';
import { useUserStore } from '../state/userStore';
import { usePackCatalogStore } from '../state/packCatalogStore';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { UserProfile } from '../types';

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
              className="w-10 object-cover rounded"
              style={{ height: '52px' }}
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
