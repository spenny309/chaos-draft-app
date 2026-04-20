# Multi-Profile Inventory & Regular Draft Design

**Date:** 2026-04-20
**Status:** Approved

---

## Overview

Extend the Chaos Draft app to support multiple users with role-based access, multiple inventory types, and a Regular Draft mode. The existing Chaos Draft experience is preserved unchanged; new functionality is layered on top.

---

## 1. Firestore Data Model

### `users` collection *(new)*
```
{
  uid: string               // Firebase Auth UID (doc ID)
  name: string              // Display name
  email: string
  role: "admin" | "user"
  status: "pending" | "approved" | "denied"
  createdAt: Timestamp
}
```
Admin is identified by `role: "admin"`. The admin's account is seeded during migration.

---

### `packs` collection *(existing — Chaos Inventory)*
```
{
  id: string
  name: string              // Denormalized from packCatalog
  imageUrl: string          // Denormalized from packCatalog
  inPerson: number
  inTransit: number
  ownerId: string           // Always the admin UID
  catalogId: string         // Added during migration — reference to packCatalog doc
}
```
After migration, new packs may only be added by searching the `packCatalog`. Free-text pack entry is removed from this inventory.

---

### `packCatalog` collection *(new — master pack list)*
```
{
  id: string
  name: string              // Canonical pack name (e.g. "Modern Horizons 3")
  imageUrl: string          // Pack art URL
  createdAt: Timestamp
}
```
- Seeded during migration from existing `packs` documents (name + imageUrl)
- Admin-managed: only admin can add, edit, or delete entries
- When an entry is edited (name or imageUrl), all referencing `packs`, `privateInventory`, and `drafts` documents are batch-updated to reflect the change (edits are typically to fix broken image URLs, so propagating everywhere prevents stale/broken URLs in history)
- When an entry is deleted, the app warns if any live inventory documents reference it before proceeding

---

### `privateInventory` collection *(new)*
```
{
  id: string
  ownerId: string           // Firebase Auth UID
  catalogId: string         // Reference to packCatalog doc
  name: string              // Denormalized
  imageUrl: string          // Denormalized
  count: number             // How many packs this user owns
}
```
- All approved users (including admin) manage their own private inventory
- Adding a pack: user searches `packCatalog` by name (typeahead); name + imageUrl auto-filled on selection; no free-text entry
- Admin's private inventory is separate from and independent of their Chaos Inventory

---

### `drafts` collection *(unified — replaces existing `drafts`)*
```
{
  id: string
  type: "chaos" | "regular" | "mobius" | "sealed" | "team-sealed"
  createdBy: string         // UID of creating user
  createdAt: Timestamp
  status: "preview" | "finalized"   // chaos drafts are always "finalized" on save
  players: [
    {
      id: string
      name: string
      userId: string | null  // null if free-typed (guest/unregistered)
    }
  ]

  // Chaos-only fields
  sessionId?: string
  restockComplete?: boolean
  packsSelectedOrder?: [{ id, name, imageUrl }]

  // Regular/Sealed/Mobius/Team Sealed fields
  sets?: [{ catalogId, name, imageUrl, totalNeeded }]
  packsPerPerson?: number
  finalizedAt?: Timestamp
  finalizedBy?: string      // Admin UID
  allocation?: [
    {
      userId: string
      userName: string
      catalogId: string
      name: string
      count: number
    }
  ]
}
```

---

## 2. Auth & User Management

### Registration Flow
1. User fills out Name, Email, Password on the auth screen
2. Firebase Auth creates the account
3. A `users` document is written with `status: "pending"`, `role: "user"`
4. App shows a "Your account is pending approval" screen — no app access until approved
5. Firebase Trigger Email extension writes to `mail` collection, sending admin a notification email with the new user's name and email
6. Admin opens the Admin panel, sees pending user, clicks Approve or Deny
7. **Approve** → `status: "approved"`, user gains access (Firestore listener updates the pending screen in real time)
8. **Deny** → `status: "denied"`, user sees a "your request was denied" message

### Admin Role
- Identified by `role: "admin"` in `users` collection
- Seeded during migration for the existing admin account
- Admin-only capabilities: manage Chaos Inventory, finalize Regular Drafts, approve/deny users, manage Pack Catalog

### Email Notification
- Firebase Trigger Email extension (no Cloud Functions required)
- Configured once with SMTP credentials (e.g. Gmail app password)
- Sends notification email to admin on new user registration

### Firestore Security Rules Summary
- `users`: users read/write own doc; admin reads all, updates `status`/`role`
- `packs`: admin read/write only; approved users read-only
- `packCatalog`: admin write; all approved users read
- `privateInventory`: owner read/write own entries; admin reads all; approved users read all (for Draft Inventory view)
- `drafts`: approved users read all; approved users create; only admin can update `status` to `"finalized"`
- `mail`: app write-only (for trigger email); no client reads

---

## 3. Inventory Tab

Three-way selector at the top of the Inventory tab: **Chaos Inventory | Draft Inventory | Private Inventory**

### Chaos Inventory
- Existing UI preserved (pack grid with +/- controls, add/delete, CSV import/export)
- **Adding a pack:** admin searches `packCatalog` by name (typeahead), selects entry (name + imageUrl auto-filled), then enters inPerson + inTransit quantities
- Free-text pack entry removed after migration
- Non-admin users: read-only view, all edit controls hidden

### Private Inventory
- Every approved user manages their own pack list here
- **Adding a pack:** typeahead search against `packCatalog`; name + imageUrl auto-filled on selection; single `count` field (no inPerson/inTransit split)
- +/- quick controls and delete, consistent with existing Chaos Inventory UX
- Admin's private inventory is independent of their Chaos Inventory

### Draft Inventory
- Read-only aggregated view for all approved users
- Sums `count` across all `privateInventory` documents grouped by `catalogId`
- Pack cards show total count; each card has an expandable breakdown of contributors (e.g. "Spencer: 6 | Ben: 3 | Markus: 3")
- No edit controls

### Pack Catalog Management
- Accessible via an admin-only button within the Inventory tab
- Add: name + image URL
- Edit: name or imageUrl; triggers batch propagation to all referencing `packs`, `privateInventory`, and `drafts` documents (including history, to prevent broken image URLs)
- Delete: warns if any live inventory documents reference the entry

---

## 4. Draft Tab

Mode selector at the top: **Chaos Draft | Regular Draft**

### Chaos Draft Mode
Identical to current flow (setup → spinning wheel → confirm). Changes:
- Player name field gets typeahead search against registered `users`; selecting a registered user links their `userId` to that player slot; free-typing still allowed for guests
- Draft saved to unified `drafts` collection with `type: "chaos"`, `status: "finalized"`

### Regular Draft Mode

**Step 1 — Configure**
- Player count + names (same typeahead linking as chaos)
- Set(s) to draft (typeahead search against `packCatalog`, supports multiple sets)
- Format selector: Regular Draft | Mobius Draft | Sealed | Team Sealed
- Packs per person (auto-defaults: Regular Draft / Team Sealed → 3, Mobius / Sealed → 6; editable)

**Step 2 — Preview**
- Runs pack allocation algorithm (see below)
- Displays computed allocation: which packs from whose inventory, how many
- If per-set pack count required rounding, shows a warning explaining the distribution (e.g. "3 packs of Set A, 2 packs of Set B")
- Shows shortage warning per set if Draft Inventory can't cover the full need
- Any approved user can save a preview (saved with `status: "preview"`, no inventory changes)
- Preview drafts appear in History for all users to see

**Step 3 — Finalize** (admin only)
- Reads stored `allocation` from the draft document
- Applies deductions to `privateInventory` in a Firestore transaction
- Sets `status: "finalized"`, records `finalizedAt` + `finalizedBy`
- No re-computation at finalize time — exactly what was previewed is what executes

### Pack Allocation Algorithm

**Per-set pack count:**
- Total packs needed = `players.length × packsPerPerson`
- Per set = `total / sets.length`
- If not a whole number: use largest-remainder method to assign integer counts to each set such that they sum exactly to the total
- Show a rounding warning in the preview if any set received a non-floor count

**Allocation priority (per set):**
1. **Participating players first** — pull from `privateInventory` of users linked to player slots; spread usage as evenly as possible among participants before going deeper into any one person's stock
2. **Non-participating registered users second** — only tapped if participants can't cover the full need; spread evenly among non-participants
3. **Shortage** — if total available across all users is still insufficient, show a per-set warning in the preview

Allocation is stored in the `drafts` document `allocation` array at preview time. Finalization executes the stored allocation exactly.

---

## 5. History Tab

Unified list of all drafts (chaos and regular), sorted by date descending. Each record shows:
- Date, format (displayed as a type badge), players (names; linked to user profiles in future)
- **Chaos drafts:** pack picks per player, restock tracking (admin-only control to mark complete)
- **Regular drafts:** sets drafted, allocation breakdown (who contributed packs), status badge (Preview / Finalized)

A filter dropdown allows narrowing by draft type. All history visible to all approved users.

---

## 6. Admin Panel Tab

Visible only to users with `role: "admin"`.

### User Management
- Lists all users with status (Pending / Approved / Denied); pending shown first
- Approve / Deny buttons on each pending entry
- Admin can revoke approved users or re-approve denied ones

### Pack Catalog Management
- Same functionality as described in Inventory Tab section
- Central location for managing the canonical pack list

---

## 7. Navigation Structure

Updated tab structure (all approved users):
- **Draft** — chaos and regular draft modes (replaces "Session Setup" + "Draft" tabs)
- **Inventory** — chaos / draft / private inventory selector
- **History** — unified draft history
- **Admin** — user management + pack catalog (admin only; hidden from non-admin users)

---

## 8. Migration Plan

1. Seed `packCatalog` from existing `packs` collection (copy name + imageUrl per unique pack)
2. Add `catalogId` field to each `packs` document (matched by name to catalog entry)
3. Create `users` document for existing admin account with `role: "admin"`, `status: "approved"`
4. Existing `drafts` documents: add `type: "chaos"`, `status: "finalized"` fields; add `userId: null` to any player entries missing it
5. Configure Firebase Trigger Email extension with admin SMTP credentials
6. Deploy updated Firestore security rules

---

## 9. Out of Scope

- Win rate / stats tracking (player linking sets the foundation, but stats UI is a future feature)
- Scryfall API integration (packCatalog is the source of truth; Scryfall considered and rejected due to image format mismatch)
- Email approve/deny links (in-app admin panel used instead; simpler, no Cloud Functions)
- Invite-only registration (open registration with approval gate instead)
