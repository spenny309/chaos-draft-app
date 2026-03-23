# MTG Chaos Draft

A web app for organizing and running Magic: The Gathering Chaos Draft events. Manage your pack inventory, run animated draft sessions with a spinning wheel, and keep a full history of past drafts.

## Features

### Draft Sessions
- Configure player count (up to 16) and custom player names
- Animated spinning wheel selects packs via weighted random draw (weighted by quantity)
- Round-robin player rotation with audio feedback (tick sounds + chime on selection)
- Undo last pick, reset session, or confirm when complete
- Confirming a session saves the draft to history and deducts packs from inventory

### Inventory Management
- Track packs in two states: **Available** (physically on hand) and **In Transit** (on order)
- Add packs individually with name and image URL, or bulk import via CSV
- Quick +/- buttons to adjust quantities
- Export inventory to CSV for backup or sharing
- Duplicate pack names are merged, not created twice

### Draft History
- Full record of every completed draft with date and player list
- Expandable view showing each player's picks
- **Restock tracking**: automatically flags drafts where packs need physical replenishment, with a "Mark Restock Complete" action
- Delete a draft to revert its pack quantities back to inventory

## Tech Stack

- **React 19** + TypeScript, built with Vite
- **Firebase** (Auth + Firestore) for authentication and data persistence
- **Zustand** for client-side state management
- **Tailwind CSS v4** for styling
- **React Router v7** for navigation
- **PapaParse** for CSV import/export
- **Framer Motion** for animations

## Getting Started

```bash
npm install
npm run dev
```

Requires a Firebase project with Firestore and Authentication (email/password) enabled. Add your Firebase config to the environment.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |
