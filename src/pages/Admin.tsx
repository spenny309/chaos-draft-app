import { useEffect, useState } from 'react';
import { useUserStore } from '../state/userStore';
import { usePackCatalogStore } from '../state/packCatalogStore';
import { useCubeStore } from '../state/cubeStore';
import type { UserProfile } from '../types';

type AdminSection = 'users' | 'catalog' | 'cubes';

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
        <button
          onClick={() => setSection('cubes')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'cubes' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          }`}
        >
          Cubes
        </button>
      </div>

      {section === 'users' && <UserManagement />}
      {section === 'catalog' && <PackCatalogManagement />}
      {section === 'cubes' && <CubeManagement />}
    </div>
  );
}

function UserManagement() {
  const { allUsers, isLoading, loadAllUsers, updateUserStatus, deleteUser } = useUserStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
          <div className="flex gap-2 flex-wrap">
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
              <>
                <button
                  onClick={() => updateUserStatus(user.uid, 'pending')}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg font-medium"
                >
                  Reset to Pending
                </button>
                <button
                  onClick={() => setConfirmDelete(user.uid)}
                  className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 text-sm rounded-lg font-medium"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {confirmDelete && (() => {
        const user = allUsers.find(u => u.uid === confirmDelete)!;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4 border border-red-700">
              <h3 className="text-lg font-bold text-red-400">Delete User</h3>
              <p className="text-gray-300 text-sm">
                This will permanently delete <strong className="text-white">{user.name}</strong>'s
                account data from the database.
              </p>
              <p className="text-yellow-400 text-xs">
                Note: their Firebase Authentication account must be removed manually
                from the Firebase Console → Authentication.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={async () => { setConfirmDelete(null); await deleteUser(confirmDelete); }}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold"
                >
                  Delete Account Data
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CubeManagement() {
  const { cubes, loading, addCube, updateCube, deleteCube } = useCubeStore();

  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newExternalUrl, setNewExternalUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editExternalUrl, setEditExternalUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (cube: { id: string; name: string; imageUrl?: string; externalUrl?: string }) => {
    setEditingId(cube.id);
    setEditName(cube.name);
    setEditImageUrl(cube.imageUrl ?? '');
    setEditExternalUrl(cube.externalUrl ?? '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    await updateCube(editingId, {
      name: editName.trim(),
      ...(editImageUrl.trim() ? { imageUrl: editImageUrl.trim() } : {}),
      ...(editExternalUrl.trim() ? { externalUrl: editExternalUrl.trim() } : {}),
    });
    setEditingId(null);
    setEditSaving(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    await addCube({
      name: newName.trim(),
      ...(newImageUrl.trim() ? { imageUrl: newImageUrl.trim() } : {}),
      ...(newExternalUrl.trim() ? { externalUrl: newExternalUrl.trim() } : {}),
      createdBy: 'admin',
    });
    setNewName('');
    setNewImageUrl('');
    setNewExternalUrl('');
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteCube(id);
  };

  const inputCls = 'px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  return (
    <div className="space-y-6">
      {/* Cube list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-200">Cubes ({cubes.length})</h2>
        {loading && <div className="text-gray-400">Loading…</div>}
        {!loading && cubes.length === 0 && <p className="text-gray-400">No cubes yet.</p>}
        {cubes.map(cube => (
          <div key={cube.id} className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 flex items-center gap-4">
              {cube.imageUrl ? (
                <img
                  src={cube.imageUrl}
                  alt={cube.name}
                  className="w-8 h-8 object-cover rounded flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/32x32/1F2937/FFF?text=?'; }}
                />
              ) : (
                <div className="w-8 h-8 bg-gray-600 rounded flex-shrink-0" aria-hidden="true" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{cube.name}</p>
              </div>
              {cube.externalUrl && (
                <a
                  href={cube.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex-shrink-0"
                  aria-label={`Open external link for ${cube.name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <button
                onClick={() => editingId === cube.id ? setEditingId(null) : startEdit(cube)}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg font-medium flex-shrink-0"
              >
                {editingId === cube.id ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={() => handleDelete(cube.id, cube.name)}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs rounded-lg font-medium flex-shrink-0"
              >
                Delete
              </button>
            </div>
            {editingId === cube.id && (
              <form onSubmit={handleUpdate} className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-700 pt-4">
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Cube name" required className={inputCls} />
                <input type="url" value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} placeholder="Image URL (optional)" className={inputCls} />
                <input type="url" value={editExternalUrl} onChange={e => setEditExternalUrl(e.target.value)} placeholder="Cubecobra / Moxfield URL (optional)" className={inputCls} />
                <div className="flex gap-2">
                  <button type="submit" disabled={editSaving || !editName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>

      {/* Add new cube */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">Add Cube</h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Cube name" required className={inputCls} />
          <input type="url" value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Image URL (optional)" className={inputCls} />
          <input type="url" value={newExternalUrl} onChange={e => setNewExternalUrl(e.target.value)} placeholder="Cubecobra / Moxfield URL (optional)" className={inputCls} />
          <button type="submit" disabled={saving || !newName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg self-start">
            Add Cube
          </button>
        </form>
      </div>
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

  return (
    <div className="space-y-6">
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
                  <button onClick={() => handleEdit(entry.id)} disabled={saving || !editName.trim() || !editImageUrl.trim()} className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded font-medium">Save</button>
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
