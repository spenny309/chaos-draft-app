import type { DraftFormat } from '../types';

export type SetupFormat = 'Chaos Draft' | DraftFormat;
export type CardSource = 'sets' | 'cube';

const NON_CHAOS_FORMATS: DraftFormat[] = [
  'Regular Draft',
  'Mobius Draft',
  'Sealed',
  'Team Sealed',
];

export function availableSetupFormats(isAdmin: boolean): SetupFormat[] {
  return isAdmin ? ['Chaos Draft', ...NON_CHAOS_FORMATS] : [...NON_CHAOS_FORMATS];
}

export function availableCardSources(format: SetupFormat): CardSource[] {
  return format === 'Chaos Draft' ? ['sets'] : ['sets', 'cube'];
}

export function shouldDiscoverChaosCheckpoint(
  profile: { role: string; status: string } | null,
): boolean {
  return profile?.role === 'admin' && profile.status === 'approved';
}
