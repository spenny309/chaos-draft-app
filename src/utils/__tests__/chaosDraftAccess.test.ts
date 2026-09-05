import { describe, expect, it } from 'vitest';
import {
  availableCardSources,
  availableSetupFormats,
  shouldDiscoverChaosCheckpoint,
} from '../chaosDraftAccess';

describe('chaos draft access policy', () => {
  it('keeps Chaos visible to an approved admin independently of checkpoint availability', () => {
    expect(availableSetupFormats(true)).toEqual([
      'Chaos Draft',
      'Regular Draft',
      'Mobius Draft',
      'Sealed',
      'Team Sealed',
    ]);
  });

  it('keeps every non-chaos format available to an approved non-admin', () => {
    expect(availableSetupFormats(false)).toEqual([
      'Regular Draft',
      'Mobius Draft',
      'Sealed',
      'Team Sealed',
    ]);
  });

  it('keeps cube as a card source for non-admin regular formats', () => {
    expect(availableCardSources('Regular Draft')).toEqual(['sets', 'cube']);
    expect(availableCardSources('Mobius Draft')).toEqual(['sets', 'cube']);
    expect(availableSetupFormats(false)).not.toContain('Chaos Draft');
  });

  it('only discovers checkpoints for approved admins', () => {
    expect(shouldDiscoverChaosCheckpoint({ role: 'admin', status: 'approved' })).toBe(true);
    expect(shouldDiscoverChaosCheckpoint({ role: 'user', status: 'approved' })).toBe(false);
    expect(shouldDiscoverChaosCheckpoint({ role: 'admin', status: 'pending' })).toBe(false);
  });
});
