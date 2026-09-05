export type SpinCheckpointPhase = 'animating' | 'waiting-for-save' | 'failed' | 'ready';

export interface SpinCheckpointState<TPack> {
  readonly phase: SpinCheckpointPhase;
  readonly pack: Readonly<TPack>;
  readonly revision?: number;
  readonly error?: Error;
}

type SaveOutcome =
  | { readonly status: 'pending' }
  | { readonly status: 'saved'; readonly revision: number }
  | { readonly status: 'failed'; readonly error: Error };

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

export function createSpinCheckpointCoordinator<TPack extends object>(
  pack: TPack,
  persist: (pack: TPack) => Promise<number>,
) {
  const landedPack = Object.freeze({ ...pack }) as TPack;
  const listeners = new Set<(value: SpinCheckpointState<TPack>) => void>();
  let animationComplete = false;
  let outcome: SaveOutcome = { status: 'pending' };
  let state: SpinCheckpointState<TPack> = Object.freeze({
    phase: 'animating',
    pack: landedPack,
  });
  let settled: Promise<void>;
  let activeAttempt: Promise<void>;

  const publish = (next: SpinCheckpointState<TPack>) => {
    state = Object.freeze(next);
    const observerErrors: unknown[] = [];
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        observerErrors.push(error);
      }
    });
    if (observerErrors.length === 1) throw observerErrors[0];
    if (observerErrors.length > 1) {
      throw new AggregateError(observerErrors, 'Spin checkpoint subscribers failed');
    }
  };

  const save = async () => {
    let revision: number;
    try {
      revision = await persist(landedPack);
    } catch (value) {
      const error = toError(value);
      outcome = { status: 'failed', error };
      if (animationComplete) {
        publish({ phase: 'failed', pack: landedPack, error });
      }
      return;
    }

    outcome = { status: 'saved', revision };
    if (animationComplete) {
      publish({ phase: 'ready', pack: landedPack, revision });
    } else {
      publish({ phase: 'animating', pack: landedPack, revision });
    }
  };

  const startSave = () => {
    outcome = { status: 'pending' };
    activeAttempt = save();
    void activeAttempt.catch(() => undefined);
    settled = activeAttempt;
    return activeAttempt;
  };

  startSave();

  return {
    get settled() {
      return settled;
    },
    getState: () => state,
    subscribe(listener: (value: SpinCheckpointState<TPack>) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    markAnimationComplete() {
      if (animationComplete) return;

      animationComplete = true;
      if (outcome.status === 'saved') {
        publish({ phase: 'ready', pack: landedPack, revision: outcome.revision });
      } else if (outcome.status === 'failed') {
        publish({ phase: 'failed', pack: landedPack, error: outcome.error });
      } else {
        publish({ phase: 'waiting-for-save', pack: landedPack });
      }
    },
    retry() {
      if (state.phase === 'ready') return Promise.resolve();
      if (state.phase !== 'failed') return activeAttempt;

      let observerFailure: { error: unknown } | undefined;
      try {
        publish({ phase: animationComplete ? 'waiting-for-save' : 'animating', pack: landedPack });
      } catch (error) {
        observerFailure = { error };
      }

      const attempt = startSave();
      if (observerFailure) throw observerFailure.error;
      return attempt;
    },
  };
}
