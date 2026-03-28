# Orbit 轨迹

> A private mobile app for recording and sharing memories with close friends — built with React, TypeScript, and Capacitor.

**Website:** [wehihi.com](https://wehihi.com) · **Platform:** iOS (App Store) · **Contact:** support@wehihi.com

---

## Overview

Orbit is a memory-first social app designed for small, trusted circles. Unlike public social networks, every memory is tag-based and visible only to the people explicitly included. The app combines memory logging, a friendship map, and shared expense tracking into a single cohesive experience.

---

## Features

**Memory Stream**
Record moments with photos, video, long-form text, precise location, weather, mood, and route tags. Tag friends to share a memory with them directly in their feed. Participants can leave text or voice comments (up to 30s). Memories can also be browsed in a full-screen story album view with poster generation.

**Friendship Map**
All geotagged memories are plotted on an interactive map (Mapbox). Filter by friend to see a shared travel history, or zoom out to see city-level clusters.

**Shared Ledger**
Log expenses alongside a memory or independently. Expense details are always private to the author only — tagged friends see the memory but never the associated numbers. AA splits can be set up with selected participants.

**Friend System**
Friends are added via invite code through a mutual confirmation flow (send request → accept/reject). Memories use a tag-based visibility model: a memory is only visible to its author and the friends explicitly tagged in it — being friends alone does not grant access to someone's memories. Virtual friend placeholders can be created for contacts who haven't registered yet; once they join and link their account via invite code, all historical memory tags and expense records transfer automatically. Removing a friend downgrades your account to a virtual placeholder on their side; any memories where they were tagged remain accessible to them until you manually remove the tag or delete the memory.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling & Animation | Tailwind CSS, Framer Motion |
| State Management | Zustand |
| Backend & Database | Supabase (Auth, PostgreSQL, Storage) |
| Maps | Mapbox GL JS |
| Native Shell | Capacitor (iOS) |
| Deployment | Vercel |
| Monitoring | Aegis Web SDK (Tencent Cloud), Vercel Analytics |

---

## Project Structure

```
oribit/
├── src/
│   ├── api/              # Supabase client & API wrappers
│   ├── components/       # Shared UI components
│   ├── constants/        # App-wide constants (legal documents, etc.)
│   ├── pages/            # Route-level pages (Map, Memory, Ledger, Profile)
│   ├── store/            # Zustand state slices
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Helpers (settings, network, tag visibility)
├── ios/                  # Capacitor iOS project
├── public/               # Static assets, PWA manifest, privacy policy
├── supabase/             # SQL migration scripts
└── docs/                 # Internal documentation
```

---

## Local Development

**Requirements:** Node.js 18+, npm 9+

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Sync web build to native shell (Capacitor)
npx cap sync ios

# Open in Xcode
npx cap open ios
```

Environment variables (copy `.env.example` to `.env`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPBOX_TOKEN=
```

---

## Database

Core tables: `profiles`, `friendships`, `memories`, `memory_tags`, `memory_comments`, `ledgers`, `ledger_participants`.

Row Level Security (RLS) is enabled on all tables. Key rules:
- Memories are visible only to their author and explicitly tagged friends.
- Comments are visible only to participants of the parent memory.
- Storage buckets (photos, avatars, videos) are write-restricted to authenticated users.

Migration scripts in the project root (`*.sql`) should be run in the Supabase SQL Editor. Do not run `supabase-setup.sql` against a live database that contains user data — it drops and recreates all tables.

---

## Privacy & Legal

- Privacy Policy: [wehihi.com/privacy](https://wehihi.com/privacy/)
- Data is stored on Supabase infrastructure (US region).
- The app does not use advertising SDKs or sell user data.

---

## License

All rights reserved. This repository is private. Do not distribute, copy, or open-source without explicit written permission from the author.
