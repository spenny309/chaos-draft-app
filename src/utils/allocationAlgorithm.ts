export interface Contributor {
  userId: string;
  userName: string;
  available: number;
}

export interface ContributionEntry {
  userId: string;
  userName: string;
  count: number;
}

export interface SetInput {
  catalogId: string;
  name: string;
  totalNeeded: number;
  participants: Contributor[];
  nonParticipants: Contributor[];
}

export interface SetAllocation {
  catalogId: string;
  name: string;
  totalNeeded: number;
  contributions: ContributionEntry[];
  shortfall: number;
}

/**
 * Distributes `needed` packs among contributors as evenly as possible,
 * processing smallest-stock contributors first so those with more cover the remainder.
 */
export function allocateFromPool(
  contributors: Contributor[],
  needed: number
): { contributions: ContributionEntry[]; shortfall: number } {
  if (needed <= 0) return { contributions: [], shortfall: 0 };

  const sorted = [...contributors].sort((a, b) => a.available - b.available);
  const contributions: ContributionEntry[] = [];
  let remaining = needed;

  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    const contributor = sorted[i];
    const remainingContributors = sorted.length - i;
    const fairShare = Math.ceil(remaining / remainingContributors);
    const take = Math.min(contributor.available, fairShare);
    if (take > 0) {
      contributions.push({
        userId: contributor.userId,
        userName: contributor.userName,
        count: take,
      });
      remaining -= take;
    }
  }

  return { contributions, shortfall: Math.max(0, remaining) };
}

/**
 * Distributes totalPacks across numSets using the largest-remainder method,
 * guaranteeing the counts sum to exactly totalPacks.
 * @param totalPacks Must be >= 0. Negative values produce undefined behaviour.
 * @param numSets Number of sets to distribute across.
 */
export function distributePacksAcrossSets(
  totalPacks: number,
  numSets: number
): { counts: number[]; wasRounded: boolean } {
  if (numSets === 0) return { counts: [], wasRounded: false };
  if (numSets === 1) return { counts: [totalPacks], wasRounded: false };

  const floors = Array(numSets).fill(Math.floor(totalPacks / numSets));
  const remainder = totalPacks - floors.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) floors[i]++;

  return { counts: floors, wasRounded: remainder > 0 };
}

/**
 * For each set, allocates packs from participants first, then non-participants.
 */
export function allocateRegularDraft(sets: SetInput[]): SetAllocation[] {
  return sets.map(set => {
    const { contributions: participantContribs, shortfall: afterParticipants } =
      allocateFromPool(set.participants, set.totalNeeded);
    const { contributions: nonParticipantContribs, shortfall } =
      allocateFromPool(set.nonParticipants, afterParticipants);
    return {
      catalogId: set.catalogId,
      name: set.name,
      totalNeeded: set.totalNeeded,
      contributions: [...participantContribs, ...nonParticipantContribs],
      shortfall,
    };
  });
}
