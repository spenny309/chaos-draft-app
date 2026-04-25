import type { Timestamp } from 'firebase/firestore';

export interface PublicProfile {
  uid: string;
  name: string;
}

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

export type MtgColor = 'W' | 'U' | 'B' | 'R' | 'G';

export interface DraftPlayer {
  id: string;
  name: string;
  userId: string | null;
  primaryColors?: MtgColor[];
  splashColors?: MtgColor[];
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

export interface Cube {
  id: string;
  name: string;
  imageUrl?: string;
  externalUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export type TournamentStatus = 'seating' | 'active' | 'finalized';

export interface DraftSeat {
  playerId: string;
  seat: number;
}

export interface PairingResult {
  player1Wins: number;
  player2Wins: number;
  ties: number;
  matchWinner: 'player1' | 'player2' | 'tie';
  isPartial: boolean;
  submittedBy: string;
  submittedAt: Timestamp;
}

export interface TournamentPairing {
  id: string;
  player1Id: string;
  player2Id: string | null;
  result?: PairingResult;
  status: 'pending' | 'complete';
}

export interface TournamentRound {
  roundNumber: number;
  pairings: TournamentPairing[];
  status: 'active' | 'complete';
}

export interface DraftTournament {
  seats: DraftSeat[];
  rounds: TournamentRound[];
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
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
  // Tournament
  tournament?: DraftTournament;
  // Cube
  cubeId?: string;
  cubeName?: string;
  cubeImageUrl?: string;
  cubeExternalUrl?: string;
}

export type DraftFormat = 'Regular Draft' | 'Mobius Draft' | 'Sealed' | 'Team Sealed';

export const DEFAULT_PACKS_PER_PERSON: Record<DraftFormat, number> = {
  'Regular Draft': 3,
  'Mobius Draft': 6,
  'Sealed': 6,
  'Team Sealed': 4,
};
