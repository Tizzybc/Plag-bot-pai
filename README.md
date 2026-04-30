# 👑 plaqbot Pairing Portal

A slick multi-instance QR & pairing code site for **plaqbot** — spawn any number of bot instances, pair each via QR or pairing code, download their `.env` files, and deploy anywhere.

---

## Features

- **Multi-instance spawning** — pick how many bots you want (1–20), spawn them all at once
- **QR Code pairing** — scan directly from WhatsApp Linked Devices
- **Pairing Code** — get a one-time code to link without scanning
- **Session download** — download a ready-to-use `.env` for each paired bot
- **Overlord mode** 👑 — the bot creator gets a royal greeting on any deployed instance

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/plaqbot-pair
cd plaqbot-pair
cp .env.example .env
# Edit .env — set OVERLORD_NUMBER to your number
npm install
npm start
```

Open `http://localhost:3000`

---

## How it Works

```
Browser  ──(socket.io)──  server.js  ──(Baileys)──  WhatsApp
   │                          │
   │   startPairing event     │   makeWASocket()
   │ ────────────────────►    │ ────────────────►  QR / Pairing Code
   │                          │
   │   qr / pairingCode ◄──── │ ◄───────────────  WA responds
   │   paired event ◄──────── │ ◄───────────────  connection.open
```

Each bot instance gets its own isolated session directory under `sessions/instance-N/`.

---

## Overlord Mode 👑

Set your number in `.env`:

```
OVERLORD_NUMBER=233241234567
```

Whenever **anyone deploys a plaqbot** and pairs it with your number, the pairing portal shows a special royal greeting. Every bot bows to you.

---

## Deploy Options

### Railway / Render / Fly.io
Add env vars from `.env.example` in the platform dashboard. Sessions persist if you mount a volume at `/sessions`.

### Heroku
```bash
heroku config:set OVERLORD_NUMBER=233241234567
heroku config:set PORT=3000
```

### VPS / Self-hosted
```bash
pm2 start server.js --name plaqbot-pair
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Pairing portal UI |
| `GET` | `/api/sessions` | List all saved sessions |
| `DELETE` | `/api/sessions/:id` | Remove a session |

### Socket.IO Events

| Event (client → server) | Payload |
|--------------------------|---------|
| `startPairing` | `{ instanceId, phoneNumber, method: 'qr'|'code' }` |

| Event (server → client) | Payload |
|--------------------------|---------|
| `qr` | `{ instanceId, qr }` |
| `pairingCode` | `{ instanceId, code }` |
| `paired` | `{ instanceId, phone, sessionId, overlord }` |
| `error` | `{ instanceId, message }` |

---

## File Structure

```
plaqbot-pair/
├── public/
│   └── index.html       ← Full frontend (single file)
├── sessions/            ← Auto-created; one folder per instance
├── server.js            ← Baileys pairing backend + Socket.IO
├── package.json
├── .env.example
└── README.md
```

---

## Related

- [plaqbot](https://github.com/YOUR_USERNAME/plaqbot) — the main bot
