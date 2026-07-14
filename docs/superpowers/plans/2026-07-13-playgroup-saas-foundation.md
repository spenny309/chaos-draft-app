# Playgroup SaaS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's global approval/admin boundary with secure playgroup tenancy, subscription entitlements, group onboarding, and production-ready environment configuration.

**Architecture:** Global Firebase users may belong to multiple tenant-scoped groups. Firestore rules authorize every group path from `groups/{groupId}/members/{uid}`; privileged group creation and Stripe entitlement changes run in Firebase Functions. The React shell selects one active group and exposes only tenant-aware repositories to later Draft, Commander, analytics, and tracker plans.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Firebase 12, Firestore, Firebase Authentication, Firebase Functions v2, Stripe Checkout/Billing, Vitest 4, Firebase Emulator Suite.

## Global Constraints

- One subscription covers one playgroup at `$3.99/month` or `$39.99/year`; annual is the default.
- Roles are exactly `owner`, `admin`, and `member`; guests are participant records and never authenticated roles.
- Group entitlement states are exactly `incomplete`, `active`, `past_due`, `grace_period`, and `read_only`.
- Only a verified Stripe webhook may move a group into or out of a paid entitlement state.
- A registered user may belong to multiple groups; all tenant-owned records live below `groups/{groupId}`.
- Cancellation and failed payment preserve readable history; deletion is a separate owner-requested lifecycle.
- Existing global Draft, cube, and inventory collections remain untouched in this foundation plan.
- Do not begin Draft, Commander, analytics, or tracker migration until this plan's integration checkpoint passes.

---

## Planned file structure

### Frontend

- `src/domain/groups.ts` — group, membership, role, and entitlement types plus pure permission helpers.
- `src/data/groupPaths.ts` — the only constructors for tenant Firestore paths.
- `src/state/groupStore.ts` — memberships, available groups, active group selection, and listeners.
- `src/components/GroupGate.tsx` — routes users to onboarding, billing, read-only, or the paid app.
- `src/pages/CreateGroup.tsx` — creates an incomplete group through a callable function.
- `src/pages/ChooseGroup.tsx` — selects among a user's memberships.
- `src/pages/Billing.tsx` — starts Checkout and opens the Stripe customer portal.
- `src/test/fakes/groupFixtures.ts` — reusable typed fixtures for frontend tests.

### Backend

- `functions/src/index.ts` — exports callable and HTTP functions only.
- `functions/src/groups/createGroup.ts` — privileged group and owner-membership creation.
- `functions/src/billing/createCheckoutSession.ts` — validates group ownership and creates Checkout.
- `functions/src/billing/createPortalSession.ts` — validates group ownership and creates a portal session.
- `functions/src/billing/stripeWebhook.ts` — signature verification, replay protection, and entitlement projection.
- `functions/src/billing/entitlements.ts` — pure Stripe-status-to-group-state mapping.
- `functions/src/config.ts` — validated server configuration.
- `functions/src/test/*` — pure and emulator-backed backend tests.

### Firebase and operations

- `firestore.rules` — replaces global approval checks with tenant membership/role rules while retaining legacy collection rules temporarily.
- `firestore.indexes.json` — membership collection-group query index.
- `firebase.json` — emulator, functions, Firestore, and hosting configuration.
- `.firebaserc.example` — staging/production alias template without project IDs or secrets.
- `.env.example` — public Firebase and Stripe price-key names only.
- `docs/operations/saas-runbook.md` — deploy, webhook, alert, backup, and rollback checklist.

---

### Task 1: Define tenant contracts and path builders

**Files:**
- Create: `src/domain/groups.ts`
- Create: `src/data/groupPaths.ts`
- Create: `src/domain/__tests__/groups.test.ts`
- Create: `src/data/__tests__/groupPaths.test.ts`
- Create: `src/test/fakes/groupFixtures.ts`

**Interfaces:**
- Produces: `GroupRole`, `GroupEntitlement`, `Group`, `GroupMembership`, `canManageMembers()`, `canManageBilling()`, `canWriteGroupData()`, and `groupPaths`.
- Consumes: no feature modules or Firebase runtime state.

- [ ] **Step 1: Write failing permission-helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { canManageBilling, canManageMembers, canWriteGroupData } from '../groups';

describe('group permissions', () => {
  it.each([
    ['owner', true],
    ['admin', false],
    ['member', false],
  ] as const)('billing permission for %s is %s', (role, expected) => {
    expect(canManageBilling(role)).toBe(expected);
  });

  it('allows owners and admins to manage members', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
  });

  it('allows writes only for paid writable entitlements', () => {
    expect(canWriteGroupData('active')).toBe(true);
    expect(canWriteGroupData('grace_period')).toBe(true);
    expect(canWriteGroupData('incomplete')).toBe(false);
    expect(canWriteGroupData('past_due')).toBe(false);
    expect(canWriteGroupData('read_only')).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing path tests**

```ts
import { describe, expect, it } from 'vitest';
import { groupPaths } from '../groupPaths';

describe('groupPaths', () => {
  it('constructs every tenant path beneath its group', () => {
    expect(groupPaths.group('g1')).toBe('groups/g1');
    expect(groupPaths.members('g1')).toBe('groups/g1/members');
    expect(groupPaths.member('g1', 'u1')).toBe('groups/g1/members/u1');
    expect(groupPaths.participants('g1')).toBe('groups/g1/participants');
    expect(groupPaths.cubes('g1')).toBe('groups/g1/cubes');
    expect(groupPaths.draftEvents('g1')).toBe('groups/g1/draftEvents');
    expect(groupPaths.commanderGames('g1')).toBe('groups/g1/commanderGames');
    expect(groupPaths.stats('g1')).toBe('groups/g1/stats');
  });
});
```

- [ ] **Step 3: Run the tests and verify missing-module failures**

Run: `npm test -- src/domain/__tests__/groups.test.ts src/data/__tests__/groupPaths.test.ts`

Expected: FAIL because `groups.ts` and `groupPaths.ts` do not exist.

- [ ] **Step 4: Add the domain contracts and pure permissions**

```ts
// src/domain/groups.ts
import type { Timestamp } from 'firebase/firestore';

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupEntitlement =
  | 'incomplete'
  | 'active'
  | 'past_due'
  | 'grace_period'
  | 'read_only';

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  entitlement: GroupEntitlement;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupMembership {
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: Timestamp;
}

export const canManageBilling = (role: GroupRole) => role === 'owner';
export const canManageMembers = (role: GroupRole) => role === 'owner' || role === 'admin';
export const canWriteGroupData = (state: GroupEntitlement) =>
  state === 'active' || state === 'grace_period';
```

```ts
// src/data/groupPaths.ts
const groupRoot = (groupId: string) => `groups/${groupId}`;

export const groupPaths = {
  group: groupRoot,
  members: (groupId: string) => `${groupRoot(groupId)}/members`,
  member: (groupId: string, userId: string) => `${groupRoot(groupId)}/members/${userId}`,
  participants: (groupId: string) => `${groupRoot(groupId)}/participants`,
  cubes: (groupId: string) => `${groupRoot(groupId)}/cubes`,
  commanderDecks: (groupId: string) => `${groupRoot(groupId)}/commanderDecks`,
  draftEvents: (groupId: string) => `${groupRoot(groupId)}/draftEvents`,
  commanderGames: (groupId: string) => `${groupRoot(groupId)}/commanderGames`,
  trackerSessions: (groupId: string) => `${groupRoot(groupId)}/trackerSessions`,
  stats: (groupId: string) => `${groupRoot(groupId)}/stats`,
} as const;
```

- [ ] **Step 5: Add reusable typed fixtures**

```ts
// src/test/fakes/groupFixtures.ts
import { Timestamp } from 'firebase/firestore';
import type { Group, GroupMembership } from '../../domain/groups';

export const groupFixture = (overrides: Partial<Group> = {}): Group => ({
  id: 'group-1',
  name: 'Tuesday Night Magic',
  ownerId: 'owner-1',
  entitlement: 'active',
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(1),
  ...overrides,
});

export const membershipFixture = (
  overrides: Partial<GroupMembership> = {},
): GroupMembership => ({
  groupId: 'group-1',
  userId: 'owner-1',
  role: 'owner',
  joinedAt: Timestamp.fromMillis(1),
  ...overrides,
});
```

- [ ] **Step 6: Run focused and full tests**

Run: `npm test -- src/domain/__tests__/groups.test.ts src/data/__tests__/groupPaths.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 7: Commit the tenant contracts**

```bash
git add src/domain src/data src/test/fakes/groupFixtures.ts
git commit -m "feat: define playgroup tenant contracts"
```

---

### Task 2: Add group state and active-group selection

**Files:**
- Create: `src/state/groupStore.ts`
- Create: `src/state/__tests__/groupStore.test.ts`
- Modify: `src/state/userStore.ts`

**Interfaces:**
- Consumes: `Group`, `GroupMembership`, and `groupPaths` from Task 1.
- Produces: `useGroupStore` with `startListening(userId)`, `stopListening()`, `selectGroup(groupId)`, `groups`, `memberships`, `activeGroupId`, `activeGroup`, and `activeMembership`.

- [ ] **Step 1: Extract a testable active-group selector and write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { chooseActiveGroupId } from '../groupStore';

describe('chooseActiveGroupId', () => {
  it('keeps a stored group when membership still exists', () => {
    expect(chooseActiveGroupId('g2', ['g1', 'g2'])).toBe('g2');
  });

  it('falls back to the first available membership', () => {
    expect(chooseActiveGroupId('missing', ['g1', 'g2'])).toBe('g1');
  });

  it('returns null when the user has no groups', () => {
    expect(chooseActiveGroupId(null, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/state/__tests__/groupStore.test.ts`

Expected: FAIL because `groupStore.ts` does not exist.

- [ ] **Step 3: Implement selection and a membership collection-group listener**

Implement `chooseActiveGroupId(stored: string | null, available: string[]): string | null` exactly as tested. Implement the store so it queries `collectionGroup(db, 'members')` with `where('userId', '==', userId)`, loads each referenced parent group, discards missing groups, and persists `chaos-draft.activeGroupId` in `localStorage`. Store and invoke every Firestore unsubscribe function from `stopListening()`.

The listener must set `loading: false` and a user-facing `error` on failure; it must never silently retain a group the user no longer belongs to.

- [ ] **Step 4: Decouple user profiles from global approval and admin fields**

Change new profile creation in `src/state/userStore.ts` to write only `name`, `email`, and `createdAt`. Retain tolerant reads of legacy `role` and `status` fields during migration, but remove new writes derived from `VITE_ADMIN_EMAIL`.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- src/state/__tests__/groupStore.test.ts src/utils/__tests__/auth.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 6: Commit group selection**

```bash
git add src/state/groupStore.ts src/state/__tests__/groupStore.test.ts src/state/userStore.ts
git commit -m "feat: add active playgroup context"
```

---

### Task 3: Enforce tenant isolation with Firestore Rules

**Files:**
- Modify: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `test/firestore/groupRules.test.js`
- Create: `firebase.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: roles and entitlement strings from Task 1.
- Produces: rule helpers `isGroupMember(groupId)`, `hasGroupRole(groupId, roles)`, `groupIsWritable(groupId)`, and protected tenant collection rules.

- [ ] **Step 1: Install emulator test dependencies**

Run: `npm install --save-dev @firebase/rules-unit-testing firebase-tools`

Expected: dependencies are added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Add the rule-test script and emulator configuration**

Add scripts:

```json
{
  "test:rules": "firebase emulators:exec --only firestore \"vitest run test/firestore\""
}
```

Configure `firebase.json` with Firestore rules/index files and Firestore emulator port `8080`. Keep the existing Vite build directory as Hosting public directory and rewrite unknown frontend paths to `/index.html`.

- [ ] **Step 3: Write failing isolation tests**

Create emulator tests that seed, with rules disabled, groups `g1` and `g2`, owner/admin/member membership documents, one non-member, and `groups/{groupId}/cubes/c1`. Assert all of the following:

```js
await assertSucceeds(getDoc(doc(memberG1, 'groups/g1/cubes/c1')));
await assertFails(getDoc(doc(memberG1, 'groups/g2/cubes/c1')));
await assertSucceeds(setDoc(doc(memberG1, 'groups/g1/commanderGames/game1'), { result: 'tie' }));
await assertFails(setDoc(doc(readOnlyMember, 'groups/g1/commanderGames/game2'), { result: 'tie' }));
await assertSucceeds(updateDoc(doc(adminG1, 'groups/g1/members/member1'), { role: 'member' }));
await assertFails(updateDoc(doc(memberG1, 'groups/g1/members/member1'), { role: 'admin' }));
await assertFails(updateDoc(doc(ownerG1, 'groups/g1'), { entitlement: 'active' }));
```

Also assert that an owner cannot assign the `owner` role to a second membership through the client and cannot change `ownerId`, Stripe IDs, or entitlement fields.

- [ ] **Step 4: Run rule tests and verify they fail under current global rules**

Run: `npm run test:rules`

Expected: FAIL because tenant paths have no matching allow rules.

- [ ] **Step 5: Implement tenant rule helpers and collection rules**

Add helpers that read `groups/{groupId}/members/{request.auth.uid}` and the group entitlement. Allow group reads to members. Allow ordinary tenant writes only to members when entitlement is `active` or `grace_period`. Allow membership management only to owner/admin, while protecting `owner`, `ownerId`, entitlement, and Stripe fields from all clients.

Retain the old top-level collection rules temporarily so the existing app remains usable before the migration plan. Mark them with a dated removal comment referencing the Draft migration plan, not with `TODO`.

- [ ] **Step 6: Run rule tests and the existing suite**

Run: `npm run test:rules`

Expected: all isolation and role tests PASS.

Run: `npm test`

Expected: all unit tests PASS.

- [ ] **Step 7: Commit tenant rules**

```bash
git add firestore.rules firestore.indexes.json firebase.json package.json package-lock.json test/firestore
git commit -m "feat: enforce playgroup tenant isolation"
```

---

### Task 4: Create groups through a privileged callable function

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/index.ts`
- Create: `functions/src/config.ts`
- Create: `functions/src/groups/createGroup.ts`
- Create: `functions/src/groups/createGroup.test.ts`
- Modify: `firebase.json`

**Interfaces:**
- Consumes callable input `{ name: string }` and authenticated Firebase UID.
- Produces callable `createGroup` returning `{ groupId: string }`; atomically creates an `incomplete` group, owner membership, and owner participant.

- [ ] **Step 1: Create the Functions TypeScript package**

Use Node 22 and install `firebase-admin`, `firebase-functions`, `stripe`, `typescript`, and `vitest`. Add `build`, `test`, and `lint` scripts. Configure `firebase.json` to deploy `functions` from the `functions` directory.

- [ ] **Step 2: Write failing validation tests**

Extract and test:

```ts
export function normalizeGroupName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Group name is required.');
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new HttpsError('invalid-argument', 'Group name must be between 2 and 80 characters.');
  }
  return name;
}
```

Tests cover non-string input, whitespace, 1 character, 81 characters, and a trimmed valid name.

- [ ] **Step 3: Run the test and verify failure**

Run: `npm --prefix functions test -- createGroup.test.ts`

Expected: FAIL because the implementation does not exist.

- [ ] **Step 4: Implement atomic group creation**

Require `request.auth`. Create an auto-ID group ref, then use one Admin SDK batch to write:

```ts
{
  name,
  ownerId: uid,
  entitlement: 'incomplete',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}
```

Write `groups/{groupId}/members/{uid}` with `{ groupId, userId: uid, role: 'owner', joinedAt }` and `groups/{groupId}/participants/{uid}` with `{ userId: uid, displayName, kind: 'member', createdAt }`. Resolve `displayName` from the user's profile and reject missing profiles with `failed-precondition`.

- [ ] **Step 5: Export the callable and run verification**

Run: `npm --prefix functions test`

Expected: PASS.

Run: `npm --prefix functions run build`

Expected: TypeScript PASS.

- [ ] **Step 6: Commit group creation**

```bash
git add functions firebase.json
git commit -m "feat: add secure playgroup creation"
```

---

### Task 5: Implement Stripe checkout and entitlement projection

**Files:**
- Create: `functions/src/billing/entitlements.ts`
- Create: `functions/src/billing/entitlements.test.ts`
- Create: `functions/src/billing/createCheckoutSession.ts`
- Create: `functions/src/billing/createPortalSession.ts`
- Create: `functions/src/billing/stripeWebhook.ts`
- Create: `functions/src/billing/stripeWebhook.test.ts`
- Modify: `functions/src/config.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces callable `createCheckoutSession({ groupId, interval }) -> { url }`.
- Produces callable `createPortalSession({ groupId }) -> { url }`.
- Produces HTTP `stripeWebhook`.
- Produces pure `entitlementForStripeStatus(status, cancelAtPeriodEnd, currentPeriodEnd, now)`.

- [ ] **Step 1: Write failing entitlement mapping tests**

Test this exact matrix:

```ts
expect(map('active', false)).toBe('active');
expect(map('trialing', false)).toBe('active');
expect(map('past_due', false)).toBe('past_due');
expect(map('unpaid', false)).toBe('read_only');
expect(map('canceled', false)).toBe('read_only');
expect(map('active', true, futurePeriodEnd)).toBe('active');
expect(map('active', true, expiredPeriodEnd)).toBe('read_only');
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm --prefix functions test -- entitlements.test.ts`

Expected: FAIL because `entitlements.ts` does not exist.

- [ ] **Step 3: Implement the pure entitlement mapper**

Return only the five `GroupEntitlement` values. Treat Stripe `trialing` as active for forward compatibility without offering a trial. Preserve access through a future cancellation period end. Do not infer `grace_period` here; that state is set only by the explicit scheduled grace policy.

- [ ] **Step 4: Implement owner-authorized Checkout**

Validate authentication, group existence, and `ownerId === uid`. Accept only `interval: 'month' | 'year'`. Read price IDs from `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID` secrets. Reuse the stored Stripe customer or create one and persist it server-side. Create a subscription Checkout Session with `client_reference_id` and metadata containing `groupId`; return only its URL.

- [ ] **Step 5: Implement owner-authorized customer portal access**

Require the same owner check, require `stripeCustomerId`, create a portal session using the configured application return URL, and return only its URL.

- [ ] **Step 6: Write webhook replay and projection tests**

Test that the webhook service:

- Rejects an invalid signature before parsing JSON.
- Creates `stripeEvents/{eventId}` in the same transaction as the entitlement projection.
- Returns success without a second projection when the event ID already exists.
- Projects only subscriptions whose metadata maps to an existing group/customer pair.
- Stores `stripeSubscriptionId`, entitlement, period end, and `updatedAt` without changing `ownerId`.

- [ ] **Step 7: Implement and export the webhook**

Handle `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Verify the raw body with the Stripe webhook secret. Fetch the subscription when an event does not contain the complete object. Use an Admin SDK transaction for replay record and group projection.

- [ ] **Step 8: Run backend verification**

Run: `npm --prefix functions test`

Expected: all backend tests PASS.

Run: `npm --prefix functions run build`

Expected: TypeScript PASS.

- [ ] **Step 9: Commit billing**

```bash
git add functions/src/billing functions/src/config.ts functions/src/index.ts
git commit -m "feat: add playgroup subscription billing"
```

---

### Task 6: Build onboarding, group selection, and entitlement gates

**Files:**
- Create: `src/components/GroupGate.tsx`
- Create: `src/components/__tests__/GroupGate.test.tsx`
- Create: `src/pages/CreateGroup.tsx`
- Create: `src/pages/ChooseGroup.tsx`
- Create: `src/pages/Billing.tsx`
- Modify: `src/App.tsx`
- Modify: `src/state/groupStore.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes `useGroupStore`, `canWriteGroupData`, and callable functions from Tasks 2, 4, and 5.
- Produces routes `/groups/new`, `/groups`, and `/billing`; paid app content receives an active group context.

- [ ] **Step 1: Install the React DOM test stack**

Run: `npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom`

Expected: test dependencies added.

- [ ] **Step 2: Add a jsdom test config and failing gate tests**

Test these states:

```tsx
renderGate({ loading: true }).shows('Loading');
renderGate({ groups: [] }).redirects('/groups/new');
renderGate({ groups: [g1, g2], activeGroupId: null }).redirects('/groups');
renderGate({ activeGroup: incomplete }).redirects('/billing');
renderGate({ activeGroup: active }).shows('paid app');
renderGate({ activeGroup: gracePeriod }).shows('paid app');
renderGate({ activeGroup: pastDue }).showsReadOnlyBanner();
renderGate({ activeGroup: readOnly }).showsReadOnlyBanner();
```

- [ ] **Step 3: Run the gate tests and verify failure**

Run: `npm test -- src/components/__tests__/GroupGate.test.tsx`

Expected: FAIL because `GroupGate.tsx` does not exist.

- [ ] **Step 4: Implement group onboarding pages**

`CreateGroup` validates 2–80 trimmed characters, calls `createGroup`, refreshes memberships, selects the returned group, and navigates to `/billing`. Disable duplicate submission and display callable error messages.

`ChooseGroup` lists only loaded memberships, shows role and entitlement, calls `selectGroup`, and returns to `/`. Include a Create another group link.

`Billing` shows `$39.99/year` first and `$3.99/month` second. Buttons call `createCheckoutSession` and assign `window.location.href` to the returned Stripe URL. Owners with a customer ID also see Manage billing, backed by `createPortalSession`.

- [ ] **Step 5: Replace global approval routing in `App.tsx`**

Start/stop `useGroupStore` with Firebase auth. Remove `PendingScreen`, `DeniedScreen`, `profile.status` loading gates, and `profile.role === 'admin'`. Wrap tenant app routes in `GroupGate`. Do not migrate existing global stores yet; keep them mounted only inside the paid gate so the app remains functional until the Draft migration plan.

- [ ] **Step 6: Run frontend verification**

Run: `npm test -- src/components/__tests__/GroupGate.test.tsx src/state/__tests__/groupStore.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite PASS.

- [ ] **Step 7: Commit onboarding and gates**

```bash
git add src/components/GroupGate.tsx src/components/__tests__/GroupGate.test.tsx src/pages/CreateGroup.tsx src/pages/ChooseGroup.tsx src/pages/Billing.tsx src/App.tsx src/state/groupStore.ts package.json package-lock.json
git commit -m "feat: add paid playgroup onboarding"
```

---

### Task 7: Add member invitations and owner-only lifecycle operations

**Files:**
- Create: `functions/src/groups/createInvite.ts`
- Create: `functions/src/groups/acceptInvite.ts`
- Create: `functions/src/groups/setMemberRole.ts`
- Create: `functions/src/groups/transferOwnership.ts`
- Create: `functions/src/groups/requestGroupDeletion.ts`
- Create: `functions/src/groups/membershipFunctions.test.ts`
- Create: `src/pages/GroupMembers.tsx`
- Create: `src/pages/__tests__/GroupMembers.test.tsx`
- Modify: `functions/src/index.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces callable `createInvite({ groupId }) -> { token, expiresAt }` for owner/admin.
- Produces callable `acceptInvite({ token }) -> { groupId }` for an authenticated user.
- Produces callable `setMemberRole({ groupId, userId, role })` with `role: 'admin' | 'member'`.
- Produces callable `transferOwnership({ groupId, newOwnerId })` and `requestGroupDeletion({ groupId })` for the current owner.

- [ ] **Step 1: Write failing membership-service tests**

Test that invite tokens are generated from 32 random bytes, stored only as a SHA-256 hash, expire after seven days, and may be redeemed once. Test that admins may invite and change `member`/`admin` roles but cannot promote an owner, transfer ownership, or request deletion. Test that ownership transfer atomically changes the group's `ownerId`, demotes the previous owner to `admin`, and promotes the selected existing member to `owner`.

Test deletion requests write this exact server-owned shape without deleting data:

```ts
{
  status: 'requested',
  requestedBy: ownerId,
  requestedAt: FieldValue.serverTimestamp(),
  deleteAfter: Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
}
```

- [ ] **Step 2: Run the backend test and verify failure**

Run: `npm --prefix functions test -- membershipFunctions.test.ts`

Expected: FAIL because the callable services do not exist.

- [ ] **Step 3: Implement single-use invitation callables**

`createInvite` requires an owner/admin membership and writes `groupInvites/{hash}` with `groupId`, `createdBy`, `expiresAt`, and `usedAt: null`. Return the unhashed URL-safe token. `acceptInvite` hashes the supplied token and transactionally verifies it is unused/unexpired, creates `groups/{groupId}/members/{uid}` and a linked participant, then records `usedAt` and `usedBy`. Existing members receive an idempotent success.

- [ ] **Step 4: Implement role, ownership, and deletion callables**

All four operations re-read group and membership documents inside Admin SDK transactions. `setMemberRole` accepts only `admin` or `member`. `transferOwnership` requires the target to be an existing member. `requestGroupDeletion` writes the 30-day request object and changes entitlement to `read_only`; physical recursive deletion is deliberately excluded until every feature collection and export is implemented.

- [ ] **Step 5: Write the failing member-page test**

Render owner, admin, and member variants. Assert owners see Invite, role controls, Transfer ownership, and Request deletion; admins see Invite and member/admin role controls; members see the roster only. Assert the confirmation text for ownership transfer requires the exact group name before enabling submission.

- [ ] **Step 6: Implement `GroupMembers` and route it**

Use the active membership role to render controls, but rely on callable authorization for security. Copy invite links with the Web Clipboard API and also render the link for manual copying. Add `/group/members` inside `GroupGate`; display pending deletion date and keep the group read-only after a deletion request.

- [ ] **Step 7: Run backend, frontend, and build verification**

Run: `npm --prefix functions test -- membershipFunctions.test.ts`

Expected: PASS.

Run: `npm test -- src/pages/__tests__/GroupMembers.test.tsx`

Expected: PASS.

Run: `npm run build`

Expected: frontend build PASS.

Run: `npm --prefix functions run build`

Expected: Functions build PASS.

- [ ] **Step 8: Commit membership lifecycle support**

```bash
git add functions/src/groups functions/src/index.ts src/pages/GroupMembers.tsx src/pages/__tests__/GroupMembers.test.tsx src/App.tsx
git commit -m "feat: add playgroup membership management"
```

---

### Task 8: Add environment separation and the operating runbook

**Files:**
- Create: `.firebaserc.example`
- Modify: `.env.example`
- Modify: `.gitignore`
- Create: `docs/operations/saas-runbook.md`
- Modify: `README.md`

**Interfaces:**
- Consumes Firebase/Stripe configuration names from Tasks 4–6.
- Produces a repeatable staging/production deployment and recovery procedure without committing secrets or real project IDs.

- [ ] **Step 1: Add explicit public configuration names**

Document these frontend variables in `.env.example` without values:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FUNCTIONS_REGION=us-central1
```

Stripe price IDs and webhook secrets are Functions secrets and must not use `VITE_` variables.

- [ ] **Step 2: Add safe Firebase alias documentation**

`.firebaserc.example` contains placeholder aliases `staging` and `production`; `.firebaserc` remains ignored. The README documents copying the example and assigning real project IDs with `firebase use --add`.

- [ ] **Step 3: Write the operating runbook**

Include exact sections and commands for:

- Setting Functions secrets for Stripe key, webhook secret, monthly/annual price IDs, and app URL
- Deploying rules/functions/hosting to staging, then production
- Registering and testing the Stripe webhook
- Configuring GCP budget thresholds at `$5`, `$10`, and `$25` per month
- Checking Functions errors and Stripe webhook failures
- Exporting Firestore before migrations
- Performing a staging restore rehearsal
- Moving a group to read-only during an incident without deleting data
- Rolling back Hosting/Functions while leaving Firestore untouched

- [ ] **Step 4: Verify secret hygiene and documentation links**

Run: `git grep -n "sk_live\|whsec_\|price_" -- ':!docs/superpowers/plans/*' ':!.env.example'`

Expected: no committed real-looking Stripe secret or price values.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit operations documentation**

```bash
git add .firebaserc.example .env.example .gitignore docs/operations/saas-runbook.md README.md
git commit -m "docs: add SaaS deployment runbook"
```

---

### Task 9: Foundation integration checkpoint

**Files:**
- Modify only files required to fix failures discovered by the commands below.

**Interfaces:**
- Produces the frozen platform contract consumed by the Draft, Commander, analytics, and tracker plans.

- [ ] **Step 1: Run all automated checks from a clean checkout**

Run:

```bash
npm test
npm run test:rules
npm run build
npm --prefix functions test
npm --prefix functions run build
```

Expected: every command exits `0`; no skipped tenant-isolation or webhook tests.

- [ ] **Step 2: Exercise the emulator vertical slice**

Run the Firebase Emulator Suite and verify manually:

1. Register user A and create group A.
2. Register user B and create group B.
3. Confirm each user can select only their own group.
4. Confirm direct Firestore reads across groups are denied.
5. Complete a Stripe test-mode annual Checkout for group A.
6. Replay the webhook and confirm the entitlement changes only once.
7. Cancel at period end and confirm access remains active through the stored period end.
8. Set the test subscription unpaid and confirm group A becomes read-only without losing its documents.

- [ ] **Step 3: Freeze and document downstream contracts**

Add a short `Foundation contract` section to this plan recording the actual exported types, callable names, tenant path helpers, and rule helper names. If implementation changed a planned name, update this plan and the approved design before downstream planning; do not leave two names in circulation.

- [ ] **Step 4: Write the downstream executable plans**

Create these plans against the landed paths and types:

```text
docs/superpowers/plans/2026-07-13-tenant-draft-migration.md
docs/superpowers/plans/2026-07-13-commander-games.md
docs/superpowers/plans/2026-07-13-playgroup-analytics.md
docs/superpowers/plans/2026-07-13-shared-game-tracker.md
```

The Draft, Commander, and analytics plans form parallel Wave 2. The tracker plan may build its pure state engine in parallel, but integrates only after Draft and Commander result adapters exist.

- [ ] **Step 5: Commit checkpoint fixes and contract record**

```bash
git add -A
git commit -m "chore: complete SaaS foundation checkpoint"
```

---

## Parallel execution boundary

Tasks 1–3 are sequential because types, state, and rules share contracts. After Task 3:

- Task 4 (group creation backend) and Task 8's environment-documentation scaffolding may run in parallel.
- Task 5 depends on Task 4's Functions package and group ownership model.
- Task 6 depends on Tasks 2, 4, and 5.
- Task 7 depends on Tasks 4 and 6.
- Task 9 is an integration gate and must run after every task.

After Task 9, use separate worktrees or narrowly owned directories for the three Wave 2 plans. Do not allow parallel workers to edit `src/domain/groups.ts`, `src/data/groupPaths.ts`, `firestore.rules`, or shared result types without central integration review.
