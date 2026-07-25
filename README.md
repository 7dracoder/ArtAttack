# Art Attack — AI Fighter Battleground

**Art Attack** is a real-time, 2-player online fighting game where you draw your own character, Gemini AI turns that sketch into a fighter with stats and moves, and you battle a friend in a synced arena.

Draw → Analyze → Fight.

---

## Overview

Two players join a shared room (code or QR). Each draws a fighter on a canvas. When both lock in, the server uses **Gemini** to:

1. **Analyze** the drawing (element, personality, stats, special abilities)
2. **Generate** a polished 2D sprite from the sketch
3. **Announce** the match with TTS voice
4. **Commentate** after the fight

Match state (lobby, drawings, fighters, HP, positions) syncs live through **Firebase Firestore**. The client runs a 60 FPS canvas arena with local physics and networked opponent state.

---

## Features

- **Create / join rooms** with a 5-character code, shareable link (`?room=CODE`), or QR code
- **Drawing studio** with brush, eraser, color presets, size control (mouse + touch)
- **Gemini multimodal analysis** — character name, element, stats, 3 special moves, dialogue, stage mood
- **AI sprite generation** — sketch → arcade-style fighter sprite
- **Announcer intro** with Gemini TTS and countdown
- **Real-time 2D fight arena** — move, jump, block, punch, specials; projectiles & particles
- **Procedural fight music** and SFX via Web Audio API
- **Post-fight AI commentary** and rematch support
- **Mobile-friendly** touch controls in the arena

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide |
| Backend | Express (Node), Vite middleware in dev |
| AI | Google Gemini (`@google/genai`) — vision, image gen, TTS, text |
| Multiplayer | Firebase Firestore (realtime `onSnapshot`) |
| Audio | Web Audio API (procedural BGM + SFX + Gemini PCM playback) |
| Tooling | Bun/npm, `tsx`, esbuild (production server bundle) |

---

## Game Flow

```
LOBBY → DRAWING → ANALYZING / SPRITE_GEN → INTRO → FIGHT → FINISHED
```

| Phase | What happens |
| --- | --- |
| **Lobby** | Host creates a room; guest joins by code / URL / QR. Host starts when both are ready. |
| **Drawing** | Each player sketches a fighter and locks in. When both lock, status → `ANALYZING`. |
| **Analyzing** | Server analyzes each drawing and generates a sprite; fighter data is written to Firestore. |
| **Intro** | Announcer TTS introduces both fighters; countdown → fight. |
| **Fight** | Real-time arena combat until KO or finish; optional rematch. |

Host (`player1`) typically advances room status and initializes fight state.

---

## Prerequisites

- **Node.js** 20+ (or **Bun**)
- A **Gemini API key** ([Google AI Studio](https://aistudio.google.com/apikey))
- A **Firebase** project with Firestore enabled (or use the included applet config if you already have one provisioned)

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/ArtAttack.git
cd ArtAttack
npm install
# or: bun install
```

### 2. Environment variables

Copy the example env file and fill in secrets:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Gemini API key used by the Express server |
| `APP_URL` | Optional | Public base URL of the app (useful for share links / hosting) |

The server reads `GEMINI_API_KEY` from the environment. Without it, AI endpoints will fail unless a key is supplied another way in your deployment setup.

### 3. Firebase

Client Firebase settings live in [`firebase-applet-config.json`](./firebase-applet-config.json). On load, [`src/lib/firebaseHelper.ts`](./src/lib/firebaseHelper.ts) initializes the app from that file (or an override).

Rooms are stored under the Firestore collection:

```text
art_attack_rooms/{roomCode}
```

Deploy or apply [`firestore.rules`](./firestore.rules) to your project. The checked-in rules allow open read/write for prototyping — **tighten them before any public production deploy**.

### 4. Run in development

```bash
npm run dev
```

This starts `server.ts` on **http://localhost:3000** with Vite middleware (HMR + SPA).

Open two browser windows (or one desktop + one phone on the same network), create a room in one, join with the code in the other.

### 5. Production build

```bash
npm run build
npm start
```

- `build` — Vite client build + esbuild bundle of `server.ts` → `dist/server.cjs`
- `start` — runs the production server and serves static files from `dist/`

Other scripts:

```bash
npm run lint    # tsc --noEmit
npm run clean   # remove dist / build artifacts
```

---

## Controls

### Keyboard

| Action | Keys |
| --- | --- |
| Move left / right | `A` / `D` or `←` / `→` |
| Jump | `W` or `↑` |
| Block | `S` or `↓` |
| Basic punch | `Space` |
| Special 1 / 2 / 3 | `1` / `2` / `3` or `Z` / `X` / `C` |

### Touch

On-screen D-pad buttons appear for move / jump on mobile; ability buttons are on the HUD.

Blocking reduces incoming damage (~70% reduction). Defense also mitigates damage. Abilities respect per-move cooldowns from Gemini’s analysis.

---

## Project Structure

```text
ArtAttack/
├── index.html                 # SPA entry
├── server.ts                  # Express + Gemini API routes + Vite/static
├── package.json
├── vite.config.ts
├── tsconfig.json
├── firebase-applet-config.json
├── firestore.rules
├── .env.example
├── metadata.json              # App name / capability metadata
└── src/
    ├── main.tsx
    ├── App.tsx                # Phase router + room state
    ├── index.css
    ├── types.ts               # Shared game / room types
    ├── lib/
    │   ├── firebaseHelper.ts  # Rooms, sync, fight state
    │   └── audioEngine.ts     # BGM, SFX, Gemini TTS playback
    └── components/
        ├── TopConfigBar.tsx
        ├── Phase0Lobby.tsx
        ├── Phase1DrawingRoom.tsx
        ├── Phase2Phase3FighterGen.tsx
        ├── Phase4AnnouncerIntro.tsx
        └── Phase5FightArena.tsx
```

---

## API Reference

All Gemini calls are proxied through the Express server (keeps the API key off the client). Base URL is the same origin as the app (e.g. `http://localhost:3000`).

### `POST /api/gemini/analyze-fighter`

Analyzes a hand-drawn PNG (base64) and returns structured fighter JSON.

**Body**

```json
{
  "drawing": "data:image/png;base64,...",
  "customApiKey": "optional"
}
```

**Response (success)** — `characterName`, `element`, `personality`, `stats` (`hp`, `attack`, `defense`, `speed`), `abilities[]`, `musicMood`, `entryDialogue`, `victoryDialogue`, `environmentName`.

**Model:** `gemini-3.6-flash` (structured JSON schema).

---

### `POST /api/gemini/generate-sprite`

Redraws the sketch as a polished 1:1 fighting-game sprite.

**Body**

```json
{
  "drawing": "data:image/png;base64,...",
  "characterName": "Blaze Knight",
  "element": "fire",
  "customApiKey": "optional"
}
```

**Response** — `{ "success": true, "spriteUrl": "data:image/png;base64,..." }`  
On failure, may return the original drawing as `fallbackUrl`.

**Model:** `gemini-3.1-flash-image`.

---

### `POST /api/gemini/generate-announcer-tts`

Generates dramatic announcer audio (PCM base64).

**Body**

```json
{
  "text": "Introducing Blaze Knight!",
  "voice": "Fenrir",
  "customApiKey": "optional"
}
```

**Response** — `{ "success": true, "audioBase64": "...", "sampleRate": 24000 }`

**Model:** `gemini-3.1-flash-tts-preview`.

---

### `POST /api/gemini/generate-commentary`

Short post-match commentary.

**Body**

```json
{
  "winnerName": "Blaze Knight",
  "loserName": "Ice Wraith",
  "duration": 42,
  "remainingHp": 37,
  "customApiKey": "optional"
}
```

**Response** — `{ "success": true, "commentary": "..." }`

---

## Multiplayer Architecture

```text
┌─────────────┐     Firestore snapshots      ┌─────────────┐
│  Player 1   │◄────────────────────────────►│  Player 2   │
│  (browser)  │                              │  (browser)  │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  POST /api/gemini/*                        │
       └──────────────────►┌──────────────┐◄────────┘
                           │ Express +    │
                           │ Gemini SDK   │
                           └──────────────┘
```

- **Authoritative sync surface:** Firestore room document (`status`, players, `fighterData`, `fightState`).
- **Local simulation:** Each client runs movement/physics for their own fighter at ~60 FPS and writes updates via `syncPlayerState` / damage helpers.
- **Opponent rendering:** Remote state is lerped for smoother motion.
- **Session identity:** `sessionStorage` user id (`art_attack_uid`); rooms cap at **2 players**.

---

## Fighter Data Model (summary)

Generated fighters include:

- **Identity:** name, element, personality  
- **Stats:** HP, attack, defense, speed  
- **Abilities:** name, description, damage, cooldown, type (`projectile` | `melee` | `buff` | `area`)  
- **Flavor:** music mood, entry/victory lines, environment name  
- **Art:** original drawing URL + generated sprite URL  

See [`src/types.ts`](./src/types.ts) for full TypeScript definitions (`RoomData`, `FighterData`, `PlayerFightState`, etc.).

---

## Configuration Notes

- **Firebase** is auto-initialized from `firebase-applet-config.json` (supports a non-default `firestoreDatabaseId`).
- **Gemini** is server-side only; set `GEMINI_API_KEY` in `.env` for local runs.
- In AI Studio / Cloud Run-style hosting, `GEMINI_API_KEY` and `APP_URL` may be injected at runtime (see comments in `.env.example`).
- Vite HMR can be disabled with `DISABLE_HMR=true` (used in some agent/edit environments).

---

## Troubleshooting

| Issue | What to try |
| --- | --- |
| Firebase not connected | Confirm `firebase-applet-config.json` has a valid `projectId` and Firestore is enabled; check browser console. |
| Analyze / sprite / TTS fails | Ensure `GEMINI_API_KEY` is set and the key has access to the models used in `server.ts`. |
| Second player can’t join | Room may already have 2 players, or the code is wrong (codes are uppercase alphanumeric). |
| Fight feels desynced | Both clients need a stable network; fight state syncs through Firestore — high latency will lag opponent lerp. |
| No sound | Browsers require a user gesture before AudioContext; click/tap once, and ensure sound isn’t muted in the arena UI. |
| Port in use | Server listens on **3000**; free the port or change `PORT` in `server.ts`. |

---

## Security

- Do **not** commit real `.env` files (ignored via `.gitignore`).
- Firebase **client** config in the repo is normal for web apps, but Firestore rules in this repo are open — replace with authenticated, room-scoped rules before production.
- Keep `GEMINI_API_KEY` on the server only; never expose it in frontend bundles.

---

## License

Private project (`"private": true` in `package.json`). Add a license file if you plan to open-source or redistribute.

---

## Credits

Built with **React**, **Firebase**, and **Google Gemini** — draw it, AI powers it, fight it.
