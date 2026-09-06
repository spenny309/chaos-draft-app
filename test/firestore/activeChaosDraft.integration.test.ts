import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  terminate,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createActiveChaosDraftRepository,
  createFirestoreAdapter,
  type ActiveChaosDraftRepository,
  type FirestoreAdapter,
} from '../../src/repositories/activeChaosDraftRepository';
import type { DraftPlayer, DraftTournament } from '../../src/types';

vi.mock('../../src/firebase', () => ({ auth: { currentUser: null }, db: {} }));

const projectId = 'demo-chaos-checkpoints';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = emulatorHost ? describe : describe.skip;

const players: DraftPlayer[] = [
  { id: 'player-1', name: 'Player 1', userId: null },
  { id: 'player-2', name: 'Player 2', userId: null },
];

const tournament: DraftTournament = {
  seats: [
    { playerId: 'player-1', seat: 1 },
    { playerId: 'player-2', seat: 2 },
  ],
  rounds: [
    {
      roundNumber: 1,
      status: 'active',
      pairings: [
        {
          id: 'round-1-match-1',
          player1Id: 'player-1',
          player2Id: 'player-2',
          status: 'pending',
        },
      ],
    },
  ],
  currentRound: 1,
  totalRounds: 1,
  status: 'active',
};

interface Actor {
  app: FirebaseApp;
  db: Firestore;
  repository: ActiveChaosDraftRepository;
  uid: string;
}

let actorSequence = 0;
const apps: FirebaseApp[] = [];

function actor(uid: string): Actor {
  const app = initializeApp(
    { apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com`, projectId },
    `checkpoint-${uid}-${actorSequence++}`,
  );
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, {
    mockUserToken: { sub: uid, user_id: uid, email: `${uid}@test.invalid` },
  });
  return {
    app,
    db,
    repository: createActiveChaosDraftRepository(createFirestoreAdapter(db), () => uid),
    uid,
  };
}

async function provision(actorValue: Actor, role: 'admin' | 'user'): Promise<void> {
  await setDoc(doc(actorValue.db, 'users', actorValue.uid), {
    name: actorValue.uid,
    email: `${actorValue.uid}@test.invalid`,
    role,
    status: 'approved',
  });
}

function createInput(ownerId = 'admin-1', numPacks = 3) {
  return { ownerId, sessionId: 'session-1', players, numPacks };
}

function command(expectedRevision: number, ownerId = 'admin-1') {
  return { ownerId, sessionId: 'session-1', expectedRevision };
}

function inventoryPack(id: string, inPerson: number, ownerId = 'admin-1') {
  return {
    id,
    ownerId,
    catalogId: `catalog-${id}`,
    name: `Pack ${id.toUpperCase()}`,
    imageUrl: `${id}.jpg`,
    inPerson,
    inTransit: 0,
  };
}

function packRef(id: string) {
  return { id, name: `ignored-${id}`, imageUrl: `ignored-${id}.jpg` };
}

async function seedInventory(admin: Actor, quantities = { a: 4, b: 2 }): Promise<void> {
  await Promise.all(
    Object.entries(quantities).map(([id, quantity]) =>
      setDoc(doc(admin.db, 'packs', id), inventoryPack(id, quantity)),
    ),
  );
}

async function buildCompleteCheckpoint(admin: Actor): Promise<{
  finalDraftId: string;
  revision: number;
}> {
  const created = await admin.repository.create(createInput());
  await admin.repository.appendPack(command(0), packRef('a'));
  await admin.repository.appendPack(command(1), packRef('b'));
  await admin.repository.appendPack(command(2), packRef('a'));
  const saved = await admin.repository.saveTournament(command(3), tournament);
  return { finalDraftId: created.finalDraftId, revision: saved.revision };
}

async function expectInventory(admin: Actor, quantities: { a: number; b: number }): Promise<void> {
  const [a, b] = await Promise.all([
    getDoc(doc(admin.db, 'packs', 'a')),
    getDoc(doc(admin.db, 'packs', 'b')),
  ]);
  expect(a.data()?.inPerson).toBe(quantities.a);
  expect(b.data()?.inPerson).toBe(quantities.b);
}

async function clearFirestore(): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`Firestore emulator cleanup failed: ${response.status}`);
}

describeWithEmulator('active chaos draft Firestore integration', () => {
  beforeAll(() => {
    expect(emulatorHost).toBe('127.0.0.1:8080');
  });

  beforeEach(clearFirestore);

  afterAll(async () => {
    await Promise.all(apps.map(async (app) => {
      await terminate(getFirestore(app)).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }));
  });

  it('allows only the approved admin owner to create and read a checkpoint', async () => {
    const admin = actor('admin-1');
    const user = actor('user-1');
    const otherAdmin = actor('admin-2');
    await Promise.all([provision(admin, 'admin'), provision(user, 'user'), provision(otherAdmin, 'admin')]);

    await expect(admin.repository.create(createInput())).resolves.toMatchObject({
      ownerId: 'admin-1',
      revision: 0,
      packsSelectedOrder: [],
    });
    await expect(user.repository.get('user-1')).rejects.toThrow();
    await expect(otherAdmin.repository.get('admin-1')).rejects.toThrow();
    await expect(getDoc(doc(otherAdmin.db, 'activeChaosDrafts', 'admin-1'))).rejects.toThrow();
    await expect(admin.repository.create(createInput())).rejects.toThrow(/already exists/i);
  });

  it('rejects malformed creates and stale or identity-changing direct updates', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    const activeRef = doc(admin.db, 'activeChaosDrafts', 'admin-1');
    const malformed = {
      ownerId: 'admin-1',
      sessionId: 'session-1',
      finalDraftId: 'draft-1',
      revision: 0,
      players,
      numPacks: '3',
      packsSelectedOrder: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expect(setDoc(activeRef, malformed)).rejects.toThrow();
    await admin.repository.create(createInput());
    await expect(updateDoc(activeRef, { revision: 1, ownerId: 'other', updatedAt: serverTimestamp() })).rejects.toThrow();
    await expect(updateDoc(activeRef, { revision: 9, updatedAt: serverTimestamp() })).rejects.toThrow();
    await expect(updateDoc(activeRef, { revision: 1, pendingTournament: [], updatedAt: serverTimestamp() })).rejects.toThrow();
  });

  it.each(['regular', 'mobius', 'sealed', 'team-sealed', 'cube'])(
    'allows an approved non-admin to create a %s draft',
    async (type) => {
      const user = actor('user-1');
      await provision(user, 'user');
      await expect(setDoc(doc(user.db, 'drafts', `user-${type}`), {
        type,
        createdBy: 'user-1',
        createdAt: serverTimestamp(),
        status: 'preview',
        players,
      })).resolves.toBeUndefined();
    },
  );

  it('denies direct Chaos draft creation by an approved non-admin', async () => {
    const user = actor('user-1');
    await provision(user, 'user');
    await expect(setDoc(doc(user.db, 'drafts', 'user-chaos'), {
      type: 'chaos',
      createdBy: 'user-1',
      createdAt: serverTimestamp(),
      status: 'finalized',
      players,
    })).rejects.toThrow();
  });

  it('checkpoint mutations preserve inventory and create no prefinal draft', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const quantityBeforeCheckpoint = 4;
    const created = await admin.repository.create(createInput());
    const finalDraftRef = doc(admin.db, 'drafts', created.finalDraftId);
    const packARef = doc(admin.db, 'packs', 'a');

    await admin.repository.appendPack(command(0), packRef('a'));
    await admin.repository.appendPack(command(1), packRef('b'));
    await admin.repository.undo(command(2));
    await admin.repository.appendPack(command(3), packRef('b'));
    await admin.repository.appendPack(command(4), packRef('a'));
    await admin.repository.saveTournament(command(5), tournament);
    await admin.repository.saveTournament(command(6), tournament);

    expect((await getDoc(packARef)).data()?.inPerson).toBe(quantityBeforeCheckpoint);
    expect((await getDoc(finalDraftRef)).exists()).toBe(false);
    await admin.repository.discard(command(7));
    expect((await getDoc(packARef)).data()?.inPerson).toBe(quantityBeforeCheckpoint);
    expect((await getDoc(finalDraftRef)).exists()).toBe(false);
  });

  it('rejects selections beyond live quantity and checkpoint capacity without side effects', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin, { a: 1, b: 2 });
    const created = await admin.repository.create(createInput('admin-1', 2));

    await admin.repository.appendPack(command(0), packRef('a'));
    await expect(admin.repository.appendPack(command(1), packRef('a'))).rejects.toThrow(/quantity/i);
    await admin.repository.appendPack(command(1), packRef('b'));
    await expect(admin.repository.appendPack(command(2), packRef('b'))).rejects.toThrow(/capacity/i);
    await expectInventory(admin, { a: 1, b: 2 });
    expect((await getDoc(doc(admin.db, 'drafts', created.finalDraftId))).exists()).toBe(false);
  });

  it('atomically writes the exact finalized draft, deducts counts, and deletes the checkpoint', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);
    const finalDraftRef = doc(admin.db, 'drafts', finalDraftId);
    expect((await getDoc(finalDraftRef)).exists()).toBe(false);

    await expect(admin.repository.finalize(command(revision))).resolves.toEqual({ draftId: finalDraftId });

    const finalSnapshot = await getDoc(finalDraftRef);
    expect(finalSnapshot.data()).toEqual({
      type: 'chaos',
      createdBy: 'admin-1',
      createdAt: expect.any(Timestamp),
      status: 'finalized',
      finalizedAt: expect.any(Timestamp),
      finalizedBy: 'admin-1',
      sessionId: 'session-1',
      players,
      packsSelectedOrder: [
        { id: 'a', name: 'Pack A', imageUrl: 'a.jpg' },
        { id: 'b', name: 'Pack B', imageUrl: 'b.jpg' },
        { id: 'a', name: 'Pack A', imageUrl: 'a.jpg' },
      ],
      restockComplete: false,
      tournament,
    });
    expect(finalSnapshot.data()?.createdAt).toBeInstanceOf(Timestamp);
    expect(finalSnapshot.data()?.finalizedAt).toBeInstanceOf(Timestamp);
    await expectInventory(admin, { a: 2, b: 1 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(false);
  });

  it('preserves an existing final draft, inventory, and checkpoint when finalization conflicts', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);
    const finalDraftRef = doc(admin.db, 'drafts', finalDraftId);
    const existing = { type: 'chaos', marker: 'existing', createdBy: 'admin-1' };
    await setDoc(finalDraftRef, existing);

    await expect(admin.repository.finalize(command(revision))).rejects.toThrow(/already exists/i);
    expect((await getDoc(finalDraftRef)).data()).toEqual(existing);
    await expectInventory(admin, { a: 4, b: 2 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(true);
  });

  it('preserves the absent draft, inventory, and checkpoint for insufficient inventory', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);
    await updateDoc(doc(admin.db, 'packs', 'a'), { inPerson: 1 });

    await expect(admin.repository.finalize(command(revision))).rejects.toThrow(/quantity/i);
    expect((await getDoc(doc(admin.db, 'drafts', finalDraftId))).exists()).toBe(false);
    await expectInventory(admin, { a: 1, b: 2 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['invalid', { status: 'finalized' }],
  ])('preserves all documents when the tournament is %s', async (_label, invalidTournament) => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const created = await admin.repository.create(createInput());
    await admin.repository.appendPack(command(0), packRef('a'));
    await admin.repository.appendPack(command(1), packRef('b'));
    await admin.repository.appendPack(command(2), packRef('a'));
    let revision = 3;
    if (invalidTournament) {
      await updateDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'), {
        revision: 4,
        pendingTournament: invalidTournament,
        updatedAt: serverTimestamp(),
      });
      revision = 4;
    }

    await expect(admin.repository.finalize(command(revision))).rejects.toThrow(/tournament|round 1/i);
    expect((await getDoc(doc(admin.db, 'drafts', created.finalDraftId))).exists()).toBe(false);
    await expectInventory(admin, { a: 4, b: 2 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(true);
  });

  it('does not let finalization race ahead of tournament persistence', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const created = await admin.repository.create(createInput());
    await admin.repository.appendPack(command(0), packRef('a'));
    await admin.repository.appendPack(command(1), packRef('b'));
    await admin.repository.appendPack(command(2), packRef('a'));

    const results = await Promise.allSettled([
      admin.repository.saveTournament(command(3), tournament),
      admin.repository.finalize(command(3)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getDoc(doc(admin.db, 'drafts', created.finalDraftId))).exists()).toBe(false);
    await expectInventory(admin, { a: 4, b: 2 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(true);
  });

  it('rolls back every finalization write when a real security denial rejects the transaction', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);
    const baseAdapter = createFirestoreAdapter(admin.db);
    const deniedAdapter: FirestoreAdapter = {
      ...baseAdapter,
      runTransaction(operation) {
        return baseAdapter.runTransaction(async (transaction) => {
          const result = await operation(transaction);
          transaction.create('users/forbidden-user', { role: 'admin', status: 'approved' });
          return result;
        });
      },
    };
    const deniedRepository = createActiveChaosDraftRepository(deniedAdapter, () => 'admin-1');

    await expect(deniedRepository.finalize(command(revision))).rejects.toThrow();
    expect((await getDoc(doc(admin.db, 'drafts', finalDraftId))).exists()).toBe(false);
    await expectInventory(admin, { a: 4, b: 2 });
    expect((await getDoc(doc(admin.db, 'activeChaosDrafts', 'admin-1'))).exists()).toBe(true);
    expect((await getDoc(doc(admin.db, 'users', 'forbidden-user'))).exists()).toBe(false);
  });

  it('rejects stale mutation and discard clients while preserving the newer checkpoint', async () => {
    const first = actor('admin-1');
    const second = actor('admin-1');
    await provision(first, 'admin');
    await seedInventory(first);
    await first.repository.create(createInput());
    const stale = await second.repository.get('admin-1');
    await first.repository.appendPack(command(0), packRef('a'));

    await expect(second.repository.appendPack(command(stale!.revision), packRef('b'))).rejects.toThrow(/updated elsewhere/i);
    await expect(second.repository.discard(command(stale!.revision))).rejects.toThrow(/updated elsewhere/i);
    await expect(first.repository.get('admin-1')).resolves.toMatchObject({
      revision: 1,
      packsSelectedOrder: [{ id: 'a' }],
    });
  });

  it('rejects stale finalization while preserving the absent draft, inventory, and checkpoint', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);

    await expect(admin.repository.finalize(command(revision - 1))).rejects.toThrow(/updated elsewhere/i);
    expect((await getDoc(doc(admin.db, 'drafts', finalDraftId))).exists()).toBe(false);
    await expectInventory(admin, { a: 4, b: 2 });
    await expect(admin.repository.get('admin-1')).resolves.toMatchObject({ revision });
  });

  it('reconciles draft-only presence as committed', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await setDoc(doc(admin.db, 'drafts', 'draft-1'), {
      type: 'chaos', status: 'finalized', createdBy: 'admin-1', finalizedBy: 'admin-1',
      sessionId: 'session-1', createdAt: serverTimestamp(), finalizedAt: serverTimestamp(), players,
    });
    await expect(admin.repository.reconcile('admin-1', 'draft-1')).resolves.toEqual({
      status: 'committed', draftId: 'draft-1',
    });
  });

  it('reconciles checkpoint-only presence as not committed', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    const checkpoint = await admin.repository.create(createInput());
    await expect(admin.repository.reconcile('admin-1', checkpoint.finalDraftId)).resolves.toMatchObject({
      status: 'not-committed', checkpoint: { finalDraftId: checkpoint.finalDraftId },
    });
  });

  it('reconciles both documents present as an integrity error', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    const checkpoint = await admin.repository.create(createInput());
    await setDoc(doc(admin.db, 'drafts', checkpoint.finalDraftId), {
      type: 'chaos', status: 'finalized', createdBy: 'admin-1', finalizedBy: 'admin-1',
      sessionId: 'session-1', createdAt: serverTimestamp(), finalizedAt: serverTimestamp(), players,
    });
    await expect(admin.repository.reconcile('admin-1', checkpoint.finalDraftId)).resolves.toEqual({
      status: 'integrity-error',
    });
  });

  it('reconciles neither document present as an integrity error', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await expect(admin.repository.reconcile('admin-1', 'missing-draft')).resolves.toEqual({
      status: 'integrity-error',
    });
  });

  it('resolves a lost finalization response and a concurrent reconciliation authoritatively', async () => {
    const admin = actor('admin-1');
    await provision(admin, 'admin');
    await seedInventory(admin);
    const { finalDraftId, revision } = await buildCompleteCheckpoint(admin);

    const finalizePromise = admin.repository.finalize(command(revision));
    const racingReconciliation = admin.repository.reconcile('admin-1', finalDraftId);
    const raceResult = await racingReconciliation;
    expect(['committed', 'not-committed']).toContain(raceResult.status);
    await finalizePromise;
    await expect(admin.repository.reconcile('admin-1', finalDraftId)).resolves.toEqual({
      status: 'committed', draftId: finalDraftId,
    });
  });

  it('rejects unavailable reconciliation within a bounded timeout', async () => {
    const isolatedApp = initializeApp(
      { apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com`, projectId },
      `checkpoint-unavailable-${actorSequence++}`,
    );
    const isolatedDb = getFirestore(isolatedApp);
    connectFirestoreEmulator(isolatedDb, '127.0.0.1', 58089, {
      mockUserToken: {
        sub: 'admin-unavailable',
        user_id: 'admin-unavailable',
        email: 'admin-unavailable@test.invalid',
      },
    });
    const repository = createActiveChaosDraftRepository(
      createFirestoreAdapter(isolatedDb),
      () => 'admin-unavailable',
    );
    const operation = repository.reconcile('admin-unavailable', 'draft-1');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const outcome = await Promise.race([
        operation.then(
          (value) => ({ status: 'resolved' as const, value }),
          (error: unknown) => ({ status: 'rejected' as const, error }),
        ),
        new Promise<{ status: 'timeout' }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ status: 'timeout' }), 20_000);
        }),
      ]);
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') {
        expect(outcome.error).toMatchObject({ code: 'unavailable' });
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      await terminate(isolatedDb).catch(() => undefined);
      await deleteApp(isolatedApp).catch(() => undefined);
    }
  }, 25_000);
});
