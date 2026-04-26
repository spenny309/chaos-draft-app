import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock variables are available when vi.mock factories run
const {
  mockCollection,
  mockOnSnapshot,
  mockAddDoc,
  mockDeleteDoc,
  mockDoc,
  mockServerTimestamp,
} = vi.hoisted(() => {
  const mockUnsub = vi.fn();
  return {
    mockCollection: vi.fn(() => 'cubes-collection-ref'),
    mockOnSnapshot: vi.fn((_ref: unknown, cb: (snap: unknown) => void) => {
      // store the callback for test-side driving
      (global as Record<string, unknown>).__cubeOnSnapshotCb = cb;
      return mockUnsub;
    }),
    mockAddDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
    mockDoc: vi.fn(() => 'doc-ref'),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockUnsub,
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  deleteDoc: mockDeleteDoc,
  doc: mockDoc,
  serverTimestamp: mockServerTimestamp,
}));

import { useCubeStore } from '../cubeStore';

// Helper to retrieve the callback captured by onSnapshot
function getSnapshotCb(): (snap: unknown) => void {
  return (global as Record<string, unknown>).__cubeOnSnapshotCb as (snap: unknown) => void;
}

// Helper: build a fake Firestore snapshot
function makeSnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map(d => ({
      id: d.id,
      data: () => d.data,
    })),
  };
}

describe('useCubeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state to initial values
    useCubeStore.setState({ cubes: [], loading: true });
  });

  it('initial state: cubes is [] and loading is true', () => {
    const state = useCubeStore.getState();
    expect(state.cubes).toEqual([]);
    expect(state.loading).toBe(true);
  });

  it('loading becomes false after first snapshot fires', () => {
    expect(useCubeStore.getState().loading).toBe(true);

    getSnapshotCb()(makeSnap([]));

    expect(useCubeStore.getState().loading).toBe(false);
    expect(useCubeStore.getState().cubes).toEqual([]);
  });

  it('snapshot populates cubes with correct shape', () => {
    getSnapshotCb()(makeSnap([
      { id: 'cube1', data: { name: 'Vintage Cube', createdBy: 'u1', createdAt: 'ts1' } },
      { id: 'cube2', data: { name: 'Pauper Cube', imageUrl: 'http://img', externalUrl: 'http://ext', createdBy: 'u2', createdAt: 'ts2' } },
    ]));

    const { cubes, loading } = useCubeStore.getState();
    expect(loading).toBe(false);
    expect(cubes).toHaveLength(2);
    expect(cubes[0]).toEqual({ id: 'cube1', name: 'Vintage Cube', createdBy: 'u1', createdAt: 'ts1' });
    expect(cubes[1]).toEqual({ id: 'cube2', name: 'Pauper Cube', imageUrl: 'http://img', externalUrl: 'http://ext', createdBy: 'u2', createdAt: 'ts2' });
  });

  it('addCube calls addDoc on the cubes collection with required fields only (no optional)', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-id' });

    await useCubeStore.getState().addCube({ name: 'Legacy Cube', createdBy: 'u1' });

    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith('cubes-collection-ref', {
      name: 'Legacy Cube',
      createdAt: 'SERVER_TIMESTAMP',
      createdBy: 'u1',
    });
    const calledWith = mockAddDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(calledWith).not.toHaveProperty('imageUrl');
    expect(calledWith).not.toHaveProperty('externalUrl');
  });

  it('addCube includes imageUrl and externalUrl when provided', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-id' });

    await useCubeStore.getState().addCube({
      name: 'Vintage Cube',
      imageUrl: 'http://img.png',
      externalUrl: 'https://cubecobra.com/c/vintage',
      createdBy: 'u2',
    });

    expect(mockAddDoc).toHaveBeenCalledWith('cubes-collection-ref', {
      name: 'Vintage Cube',
      imageUrl: 'http://img.png',
      externalUrl: 'https://cubecobra.com/c/vintage',
      createdAt: 'SERVER_TIMESTAMP',
      createdBy: 'u2',
    });
  });

  it('deleteCube calls deleteDoc on the correct doc ref', async () => {
    mockDoc.mockReturnValue('doc-ref-cube1');
    mockDeleteDoc.mockResolvedValue(undefined);

    await useCubeStore.getState().deleteCube('cube1');

    expect(mockDoc).toHaveBeenCalledWith({}, 'cubes', 'cube1');
    expect(mockDeleteDoc).toHaveBeenCalledWith('doc-ref-cube1');
  });

  it('deleteCube does not optimistically update local state (relies on onSnapshot)', async () => {
    useCubeStore.setState({
      cubes: [
        { id: 'cube1', name: 'A', createdBy: 'u1', createdAt: {} as any },
        { id: 'cube2', name: 'B', createdBy: 'u2', createdAt: {} as any },
      ],
      loading: false,
    });

    mockDoc.mockReturnValue('doc-ref-cube1');
    mockDeleteDoc.mockResolvedValue(undefined);

    await useCubeStore.getState().deleteCube('cube1');

    // State is unchanged until onSnapshot fires with the updated server data
    const { cubes } = useCubeStore.getState();
    expect(cubes).toHaveLength(2);

    // Simulate the onSnapshot callback arriving after the delete
    getSnapshotCb()(makeSnap([
      { id: 'cube2', data: { name: 'B', createdBy: 'u2', createdAt: {} } },
    ]));

    expect(useCubeStore.getState().cubes).toHaveLength(1);
    expect(useCubeStore.getState().cubes[0].id).toBe('cube2');
  });
});
