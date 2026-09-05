import { describe, expect, it, vi } from 'vitest';
import { createSpinCheckpointCoordinator } from '../spinCheckpointCoordinator';

interface PackFixture {
  id: string;
  name: string;
  imageUrl: string;
}

const packFixture = (): PackFixture => ({
  id: 'pack-1',
  name: 'Mystery Booster',
  imageUrl: 'mystery.jpg',
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('spin checkpoint coordination', () => {
  it('starts persistence immediately and reveals only after both operations finish', async () => {
    const save = deferred<number>();
    const pack = packFixture();
    const persist = vi.fn(() => save.promise);

    const coordinator = createSpinCheckpointCoordinator(pack, persist);

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(pack);
    expect(coordinator.getState().phase).toBe('animating');

    coordinator.markAnimationComplete();
    expect(coordinator.getState().phase).toBe('waiting-for-save');

    save.resolve(8);
    await coordinator.settled;
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', pack, revision: 8 });
  });

  it('retries the identical landed pack after failure', async () => {
    const pack = packFixture();
    const persist = vi
      .fn<(pack: PackFixture) => Promise<number>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(9);
    const coordinator = createSpinCheckpointCoordinator(pack, persist);

    coordinator.markAnimationComplete();
    await coordinator.settled;
    expect(coordinator.getState().phase).toBe('failed');

    await coordinator.retry();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]?.[0]).toBe(persist.mock.calls[0]?.[0]);
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', pack, revision: 9 });
  });

  it('keeps a fast save visually silent until the animation completes', async () => {
    const coordinator = createSpinCheckpointCoordinator(packFixture(), async () => 2);

    await coordinator.settled;
    expect(coordinator.getState().phase).toBe('animating');

    coordinator.markAnimationComplete();
    expect(coordinator.getState().phase).toBe('ready');
  });

  it('does not expose a failed save before the animation lands', async () => {
    const coordinator = createSpinCheckpointCoordinator(packFixture(), async () => {
      throw new Error('offline');
    });
    const phases: string[] = [];
    coordinator.subscribe(({ phase }) => phases.push(phase));

    await coordinator.settled;
    expect(coordinator.getState()).toEqual({ phase: 'animating', pack: packFixture() });
    expect(phases).toEqual([]);

    coordinator.markAnimationComplete();
    expect(coordinator.getState()).toMatchObject({ phase: 'failed', error: new Error('offline') });
    expect(phases).toEqual(['failed']);
  });

  it('publishes immutable snapshots in operation order', async () => {
    const save = deferred<number>();
    const coordinator = createSpinCheckpointCoordinator(packFixture(), () => save.promise);
    const snapshots: Array<ReturnType<typeof coordinator.getState>> = [];
    coordinator.subscribe((state) => snapshots.push(state));

    const initial = coordinator.getState();
    coordinator.markAnimationComplete();
    save.resolve(4);
    await coordinator.settled;

    expect(snapshots.map(({ phase }) => phase)).toEqual(['waiting-for-save', 'ready']);
    expect(initial).toEqual({ phase: 'animating', pack: packFixture() });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.pack)).toBe(true);
    expect(snapshots.every(Object.isFrozen)).toBe(true);
  });

  it('ignores retries while the initial checkpoint is still in flight', async () => {
    const save = deferred<number>();
    const persist = vi.fn(() => save.promise);
    const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);

    const duringAnimation = coordinator.retry();
    coordinator.markAnimationComplete();
    const afterLanding = coordinator.retry();

    expect(persist).toHaveBeenCalledOnce();
    save.resolve(6);
    await Promise.all([duringAnimation, afterLanding]);
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', revision: 6 });
  });

  it('coalesces retry calls while a retry is in flight', async () => {
    const retrySave = deferred<number>();
    const persist = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => retrySave.promise);
    const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);
    coordinator.markAnimationComplete();
    await coordinator.settled;

    const firstRetry = coordinator.retry();
    const duplicateRetry = coordinator.retry();

    expect(persist).toHaveBeenCalledTimes(2);
    retrySave.resolve(11);
    await Promise.all([firstRetry, duplicateRetry]);
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', revision: 11 });
  });

  it('ignores retries after the checkpoint is ready', async () => {
    const persist = vi.fn(async () => 5);
    const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);
    coordinator.markAnimationComplete();
    await coordinator.settled;

    await coordinator.retry();

    expect(persist).toHaveBeenCalledOnce();
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', revision: 5 });
  });

  it('keeps a committed save ready when a subscriber throws', async () => {
    const save = deferred<number>();
    const persist = vi.fn(() => save.promise);
    const coordinator = createSpinCheckpointCoordinator(packFixture(), persist);
    const observerError = new Error('observer failed');
    const observedPhases: string[] = [];
    coordinator.subscribe(({ phase }) => {
      if (phase === 'ready') throw observerError;
    });
    coordinator.subscribe(({ phase }) => observedPhases.push(phase));
    coordinator.markAnimationComplete();
    const settledResult = expect(coordinator.settled).rejects.toBe(observerError);

    save.resolve(12);

    await settledResult;
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', revision: 12 });
    expect(observedPhases).toEqual(['waiting-for-save', 'ready']);
    await coordinator.retry();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('starts an accepted retry when its transition subscriber throws', async () => {
    const retrySave = deferred<number>();
    const pack = packFixture();
    const persist = vi
      .fn<(pack: PackFixture) => Promise<number>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => retrySave.promise);
    const coordinator = createSpinCheckpointCoordinator(pack, persist);
    coordinator.markAnimationComplete();
    await coordinator.settled;
    const observerError = new Error('transition observer failed');
    coordinator.subscribe(({ phase }) => {
      if (phase === 'waiting-for-save') throw observerError;
    });

    expect(() => coordinator.retry()).toThrow(observerError);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]?.[0]).toBe(persist.mock.calls[0]?.[0]);

    retrySave.resolve(13);
    await coordinator.settled;
    expect(coordinator.getState()).toMatchObject({ phase: 'ready', pack, revision: 13 });
  });
});
