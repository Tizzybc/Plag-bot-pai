/**
 * plaqbot Pairing Server
 * Handles QR code & pairing code generation via Baileys
 * Each instance gets its own isolated session directory
 */

require('dotenv').config();
const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const fs          = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT         = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const OVERLORD_NUM = process.env.OVERLORD_NUMBER || '233241234567'; // YOUR NUMBER

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Active sockets map: instanceId → WASocket ───────────────────────────────
const activeSockets = new Map();

// ─── OVERLORD CHECK ──────────────────────────────────────────────────────────
function isOverlord(number) {
  return number.replace(/\D/g, '') === OVERLORD_NUM.replace(/\D/g, '');
}

// ─── CREATE PAIRING INSTANCE ─────────────────────────────────────────────────
async function createInstance(instanceId, phoneNumber, method, clientSocket) {
  const sessionDir = path.join(SESSIONS_DIR, `instance-${instanceId}`);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth:              state,
    logger:            pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser:           ['plaqbot', 'Chrome', '1.0.0'],
    syncFullHistory:   false,
  });

  activeSockets.set(instanceId, sock);

  // ── QR CODE ───────────────────────────────────────────────────────────────
  if (method === 'qr') {
    sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        clientSocket.emit('qr', { instanceId, qr });
      }
      handleConnectionUpdate({ connection, lastDisconnect, instanceId, phoneNumber, sock, saveCreds, clientSocket, sessionDir });
    });

  // ── PAIRING CODE ──────────────────────────────────────────────────────────
  } else if (method === 'code') {
    if (!sock.authState.creds.registered) {
      await sock.waitForConnectionUpdate(u => !!u.qr);
      const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
      clientSocket.emit('pairingCode', { instanceId, code: code?.match(/.{1,4}/g)?.join('-') || code });
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      handleConnectionUpdate({ connection, lastDisconnect, instanceId, phoneNumber, sock, saveCreds, clientSocket, sessionDir });
    });
  }

  sock.ev.on('creds.update', saveCreds);
}

// ─── CONNECTION HANDLER ───────────────────────────────────────────────────────
function handleConnectionUpdate({ connection, lastDisconnect, instanceId, phoneNumber, sock, saveCreds, clientSocket, sessionDir }) {
  if (connection === 'open') {
    const sessionId = fs.existsSync(path.join(sessionDir, 'creds.json'))
      ? Buffer.from(fs.readFileSync(path.join(sessionDir, 'creds.json'))).toString('base64')
      : 'session-saved-to-disk';

    const overlord = isOverlord(phoneNumber);
    clientSocket.emit('paired', {
      instanceId,
      phone: phoneNumber,
      sessionId,
      overlord,
      sessionDir: `sessions/instance-${instanceId}`,
    });

  } else if (connection === 'close') {
    const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
    if (code === DisconnectReason.loggedOut) {
      clientSocket.emit('error', { instanceId, message: 'Logged out. Please re-pair.' });
      activeSockets.delete(instanceId);
    } else {
      clientSocket.emit('status', { instanceId, status: 'reconnecting' });
    }
  }
}

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[server] Client connected:', socket.id);

  socket.on('startPairing', async ({ instanceId, phoneNumber, method }) => {
    try {
      console.log(`[pair] Instance ${instanceId} | ${method} | ${phoneNumber}`);
      await createInstance(instanceId, phoneNumber, method, socket);
    } catch (err) {
      console.error('[pair] Error:', err.message);
      socket.emit('error', { instanceId, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('[server] Client disconnected:', socket.id);
  });
});

// ─── REST: session list ───────────────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  try {
    const dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
      fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
    );
    res.json({ sessions: dirs, count: dirs.length });
  } catch {
    res.json({ sessions: [], count: 0 });
  }
});

// ─── REST: delete session ─────────────────────────────────────────────────────
app.delete('/api/sessions/:id', (req, res) => {
  const dir = path.join(SESSIONS_DIR, `instance-${req.params.id}`);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════╗`);
  console.log(`║   plaqbot Pairing Server ONLINE   ║`);
  console.log(`║   http://localhost:${PORT}           ║`);
  console.log(`╚═══════════════════════════════════╝\n`);
});
