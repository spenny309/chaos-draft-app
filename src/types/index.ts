import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'denied';
  createdAt: Timestamp;
}

export interface PackCatalogEntry {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: Timestamp;
}

export interface PrivateInventoryItem {
  id: string;
  ownerId: string;
  catalogId: string;
  name: string;
  imageUrl: string;
  count: number;
}

export type DraftType = 'chaos' | 'regular' | 'mobius' | 'sealed' | 'team-sealed';
export type DraftStatus = 'preview' | 'finalized';

export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
}

export interface DraftPackRef {
  id: string;      // pack doc ID in 'packs' collection (chaos only)
  name: string;
  imageUrl: string;
}

export interface DraftSetRef {
  catalogId: string;
  name: string;
  imageUrl: string;
  totalNeeded: number;
}

export interface DraftAllocationEntry {
  userId: string;
  userName: string;
  catalogId: string;
  name: string;
  count: number;
}

export interface Draft {
  id: string;
  type: DraftType;
  createdBy: string;
  createdAt: Timestamp;
  status: DraftStatus;
  players: DraftPlayer[];
  // Chaos-only
  sessionId?: string;
  restockComplete?: boolean;
  packsSelectedOrder?: DraftPackRef[];
  // Regular/Sealed/Mobius/Team Sealed
  sets?: DraftSetRef[];
  packsPerPerson?: number;
  finalizedAt?: Timestamp | null;
  finalizedBy?: string | null;
  allocation?: DraftAllocationEntry[];
}

export type DraftFormat = 'Regular Draft' | 'Mobius Draft' | 'Sealed' | 'Team Sealed';

export const DEFAULT_PACKS_PER_PERSON: Record<DraftFormat, number> = {
  'Regular Draft': 3,
  'Mobius Draft': 6,
  'Sealed': 6,
  'Team Sealed': 3,
};
