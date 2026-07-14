# Chaos Draft Playgroup SaaS and Monetization Design

**Date:** 2026-07-13  
**Status:** Approved  
**Initial target:** 5–10 recurring playgroups

## 1. Purpose and product position

Turn the existing single-community Chaos Draft application into a small, production-quality SaaS for private Magic: The Gathering playgroups. The product helps groups run Draft events and Commander games, then preserves the history needed to understand player performance, rivalries, cubes, archetypes, commanders, and decks over time.

The product is not primarily a store tournament platform. Wizards already provides free home tournament organization, saved groups, pairings, standings, and basic history. Chaos Draft differentiates through private, durable playgroup and cube intelligence while making data collection effortless during a game night.

The concise value proposition is:

> Run the game night. Keep the history. Learn your group, decks, and cubes.

The first commercial release deliberately excludes scheduling, RSVPs, announcements, store features, entry-fee processing, public social profiles, full cube card lists, and the existing Chaos/draft-stock inventory tools. Cube records remain in scope because cube identity and history are central to Draft analytics.

## 2. Commercial model

One subscription covers one private playgroup. The paying organizer becomes the group owner; players and guests never pay individually.

- Monthly: **$3.99 per playgroup**
- Annual: **$39.99 per playgroup**, emphasized as the default
- Unlimited players, events, and linked cubes, subject to a fair-use policy
- No public free tier or trial at launch
- Early subscribers retain their launch price while continuously subscribed
- Cancellation or payment failure leads to a grace period and then read-only access; history is not immediately deleted

Stripe Checkout handles purchases and Stripe's customer portal handles cards and cancellations. A verified, idempotent webhook is the sole authority for updating subscription entitlements.

At current published US Stripe rates (2.9% + $0.30 for card processing plus 0.7% Stripe Billing), expected proceeds before tax and infrastructure are approximately:

| Plan | Gross | Estimated fees | Net |
|---|---:|---:|---:|
| Monthly | $3.99 | $0.44 | $3.55/month |
| Annual | $39.99 | $1.74 | $38.25/year |

At 5–10 annual subscribers, expected gross revenue is roughly $200–$400 per year. Firebase/GCP usage should remain inside or close to included quotas. This makes the service sustainable as a hobby-scale product if paid tooling and support time remain modest; it is not expected to repay substantial development labor at that size.

## 3. Users, groups, and permissions

### Identities

A registered user has one global account and may join multiple playgroups. Each group has durable participant records used by results:

- A member participant links to a registered user.
- A guest participant belongs only to that group and requires no account.
- A guest can later be linked to a registered user through a lightweight group-managed merge with an audit record and undo capability.

Players can participate immediately as guests. A registered player's private profile shows per-group statistics and may optionally show an aggregate personal record across groups. Group-level data remains private to that group.

### Roles

- **Owner:** manages subscription, ownership, admins, members, group deletion, and all group data.
- **Admin:** manages members and all play activities, but not billing or ownership.
- **Member:** creates and edits ordinary Draft/Commander activity, participates, assigns decks/commanders, uses the tracker, and submits or corrects results.
- **Guest:** a participant identity, not an authenticated permission-bearing role.

Low-stakes collaborative entry is intentional. Any member may create a Commander pod, select its participants, assign their decks, and report its outcome. Records retain creator/editor identity and timestamps so errors can be corrected.

## 4. Launch product scope

### 4.1 Draft and cube workflow

Groups keep a cube library using the existing behavior: an organizer adds a Cube Cobra URL and the app obtains the cube name and image. Full card-list synchronization is out of scope.

For an event, an organizer:

1. Selects a cube.
2. Adds registered members or guests.
3. Assigns seats and creates pairings/rounds.
4. Records match results manually or through the optional tracker.
5. Optionally records each player's primary colors, splash colors, and archetype information.
6. Finalizes the event and views updated history and analytics.

Results feed player records, head-to-head history, cube-specific results, and archetype/color performance. Primary colors and splash colors remain distinct. Every performance view displays its sample size.

### 4.2 Commander workflow

Commander games support **2–10 players**, with the interface optimized for the common 3–5 player range.

Players maintain a group-visible deck library. A launch-version deck is created by searching for one or two commander cards; the app stores stable card identifiers, names, and automatically sourced artwork. Two-card commanders cover Partner, Background, Doctor's Companion, and similar mechanics. An optional external deck URL may exist in the data model for future Moxfield or Archidekt support, but import is not exposed at launch.

Any member can:

1. Create a pod.
2. Select 2–10 participants.
3. Assign a saved or quickly created commander deck to every participant.
4. Start the optional tracker or skip directly to result entry.
5. Record exactly one winner or a no-winner outcome.

A no-winner Commander game is a tie for every participant. There are no second-through-tenth placements. Analytics show games, wins, ties, raw win rate, pod-size distribution, and performance relative to the expected win rate for each pod size.

### 4.3 Optional game tracker

The tracker is available by default but never required. Every Draft pairing and Commander pod offers both **Start tracker** and **Report result** paths. A user can abandon a partial tracker and report manually.

Launch support includes:

- Two-player Draft games starting at 20 life
- Commander games with 2–10 players starting at 40 life
- Touch targets that decrement life on the left and increment it on the right
- A finish flow that confirms the winner or Commander tie
- Draft best-of-three support by rolling individual tracked games into the match result
- Local recovery/checkpointing so an interruption does not lose the active game

The first release tracks life and completion only. Commander damage, poison, emblems, and other counters are future modules. The underlying tracker state must allow additional typed counters without changing canonical result records.

### 4.4 Analytics

Private group analytics include:

- Player match/game records and trends
- Head-to-head records and rivalries
- Cube history and performance
- Primary-color, splash-color, and archetype performance with sample size
- Commander and saved-deck performance
- Commander ties and pod-size-adjusted performance
- Optional private personal aggregation across groups for registered users

Canonical event and game records are the source of truth. Compact aggregate documents make dashboards inexpensive and fast. An idempotent rebuild process can regenerate every aggregate after a formula change or bug fix.

## 5. Technical architecture

### 5.1 Deployment model

Use separate staging and production Firebase/GCP projects. Production uses one shared Firestore database with tenant-scoped data, not a project or database per group.

The frontend remains React/TypeScript. Firebase Authentication provides registered accounts. Firestore stores application data. Firebase Hosting serves the static app. Small privileged endpoints and Stripe webhooks run on Cloud Run or Cloud Functions with no minimum instance count.

### 5.2 Tenant data model

The proposed logical structure is:

```text
users/{userId}
groups/{groupId}
  members/{userId}
  participants/{participantId}
  cubes/{cubeId}
  commanderDecks/{deckId}
  draftEvents/{eventId}
    rounds/{roundId}
      pairings/{pairingId}
        games/{gameId}
  commanderGames/{gameId}
  trackerSessions/{sessionId}
  stats/{aggregateId}
```

Tenant-owned data lives below its group. Result records use stable participant, cube, commander-card, and deck identifiers plus small historical snapshots where later renames or artwork changes must not rewrite history.

The current app embeds all tournament rounds in a Draft document. Production migration normalizes growing rounds, pairings, and games to avoid document-size and concurrent-update limits.

### 5.3 Authorization and security

Firestore Security Rules enforce tenant membership and role permissions using group membership documents. Application-only role checks are insufficient. No client may grant itself a role or subscription entitlement.

Server-only operations include:

- Stripe webhook processing
- Ownership transfer
- Entitlement changes
- Destructive group/account lifecycle operations
- Any aggregate rebuild requiring elevated access

Security-rule emulator tests must prove that users cannot read or write another group's data, members cannot perform admin/owner operations, and subscription state cannot be forged.

### 5.4 Billing lifecycle

Group entitlement states are:

```text
incomplete → active → past_due → grace_period → read_only
                                           ↘ active (payment recovered)
```

Deletion is separate and begins only after an explicit owner request and retention window. Read-only groups can view and export existing history but cannot create or modify play records.

Webhook handlers verify Stripe signatures, record event IDs, safely ignore replays, and map Stripe customer/subscription IDs to a single group. Billing state shown to the client is a Firestore mirror, never a client assertion.

### 5.5 Result and tracker boundaries

Draft and Commander modules produce canonical result commands through stable interfaces. Manual entry and tracker completion must generate equivalent canonical records.

The tracker consumes a game configuration and emits a proposed result. It does not own tournament or Commander statistics. It keeps rapid tap state locally and checkpoints at meaningful or throttled intervals rather than writing every life change to Firestore. Finalization confirms and commits the canonical result transactionally.

### 5.6 Reliability and cost controls

- Paginate histories and avoid unbounded listeners.
- Maintain aggregates rather than scanning all history for every dashboard visit.
- Store no full cube/deck lists at launch.
- Limit or defer large media uploads; external commander/cube artwork should not be copied unnecessarily.
- Configure GCP budget alerts and application error monitoring.
- Back up production data and perform at least one restore rehearsal before launch.
- Make aggregation and webhook handlers idempotent.
- Preserve audit fields and correction paths for user-entered results.

## 6. Existing data migration

Keep one codebase and avoid permanent personal/commercial forks. Existing Chaos Inventory and draft-stock inventory remain legacy/private modules and are absent from the commercial navigation.

Migration steps:

1. Export and back up the current Firebase data.
2. Create one initial group representing the current community.
3. Map existing users to group memberships and participants.
4. Migrate cubes, drafts, rounds, results, and relevant history into normalized tenant paths.
5. Rebuild group aggregates from migrated canonical records.
6. Compare source and destination counts and calculated totals.
7. Rehearse the migration in staging with dry-run and rollback support.
8. Cut production over only after reconciliation passes.

Migration scripts are versioned and repeatable. They report proposed, migrated, skipped, and failed records without silently discarding malformed data.

## 7. Parallel delivery plan

Parallel work begins only after shared schemas, permission rules, and canonical result contracts are agreed. Workstreams own separate feature directories and tests; shared contracts have one integration owner.

```text
Wave 0 — sequential foundation
Architecture → schemas/types → permission matrix → result contracts
                              ↓
Wave 1 — parallel platform work
A. Tenant membership + Firestore rules
B. Stripe backend + webhook tests
C. Production shell, environments, monitoring
                              ↓ integration checkpoint
Wave 2 — parallel product modules
A. Draft/cube migration + tournament flow
B. Commander deck library + pod/result entry
C. Aggregate-stat engine + rebuild tooling
                              ↓ integration checkpoint
Wave 3 — parallel experience modules
A. Shared optional game-tracker engine
B. Draft/cube/Commander analytics dashboards
C. Signup, onboarding, billing UI, account lifecycle
                              ↓
Wave 4 — integrated hardening
Migration rehearsal → security tests → mobile/accessibility QA
→ backup restore → friendly-group use → fixes → launch
```

Each parallel task receives a narrow contract, does not edit another lane's module, and returns a summary of changed behavior and files. At every checkpoint, review all changes, resolve conflicts centrally, and run the full unit, integration, and security-rule suites.

## 8. Proportionate validation and launch

This is a small, sustainable product rather than a venture-scale growth project. Validation is intentionally lightweight:

- Use the current group continuously throughout development.
- Invite a few friendly external playgroups when complete vertical slices are usable.
- Observe whether groups can set up and record a second game night without assistance.
- Collect direct feedback on confusing entry flows and analytics.
- Do not require formal preorders, a large beta cohort, paid acquisition, or elaborate product-market-fit experiments.

Launch readiness still requires correctness where mistakes would be expensive or unsafe:

- Tenant-isolation and role tests
- Successful monthly/annual checkout, webhook replay, cancellation, failed-payment, and read-only tests
- Manual/tracker result equivalence
- Aggregate rebuild reconciliation
- Mobile/touch and basic accessibility QA
- Tracker interruption recovery
- Existing-data migration reconciliation
- Backup/restore rehearsal
- Error and billing alerts
- Privacy, terms, refund, data-export, and deletion policies
- A clear support contact and simple incident checklist
- Review of Wizards trademarks, affiliation language, and applicable card-data/artwork policies

The launch page should show seeded example analytics because an empty history cannot demonstrate the product's value. Initial outreach should be personal and organic through relevant playgroups and cube/Commander communities. Paid advertising and elaborate referral systems are unnecessary at the target scale.

## 9. Success measures and post-launch priorities

The main health measure is **subscribed playgroups recording at least one completed game night per month**. Supporting measures are time to first result, groups recording a second night within 45 days, events/games per active group, tracker-versus-manual usage, flow abandonment, analytics return visits, churn, support time, and infrastructure cost per active group.

Post-launch work follows repeated real usage problems, not the theoretical breadth of an all-in-one app. Likely candidates are:

1. Commander damage, poison, emblems, and additional tracker counters
2. Moxfield and Archidekt commander-deck import
3. Stronger guest-profile claiming if misuse or ambiguity appears
4. Additional analytics requested repeatedly by active groups

Scheduling, announcements, public profiles, store features, and full card-level inventory remain deferred until the product's core play-and-history loop is reliable and regularly used.

## 10. Sources used for commercial assumptions

- [Wizards Magic Companion FAQ](https://magic-support.wizards.com/hc/en-us/articles/360032291692-Magic-The-Gathering-Companion-App-FAQ)
- [Challonge pricing](https://help.challonge.com/pricing)
- [TopDeck pricing](https://topdeck.gg/subscribe)
- [Firestore pricing](https://cloud.google.com/firestore/pricing)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Firebase Hosting pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Stripe Billing pricing](https://stripe.com/billing/pricing)

