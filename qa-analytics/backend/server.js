'use strict';
// QA Analytics Platform — Main server
// Serves: REST API (port 4000) + static dashboard + WebSocket live updates

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const http    = require('http');
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const { getDb }         = require('./db/client');
const { attachWebSocket } = require('./websocket/live');

const PORT = process.env.PORT || 4000;

// ── Initialize DB (runs schema on first start) ────────────────────────────────
const db = getDb();

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/runs',           require('./routes/runs'));
app.use('/api/flaky-tests',    require('./routes/flaky'));
app.use('/api/failure-clusters', require('./routes/clusters'));
app.use('/api/release-gate',   require('./routes/gate'));
app.use('/api/compare',        require('./routes/compare'));
app.use('/api/suites',         require('./routes/suites'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), port: PORT });
});

// ── Static dashboard (after API routes so /api/* isn't intercepted) ───────────
app.use(express.static(path.resolve(__dirname, '../dashboard')));

// ── Catch-all → dashboard SPA ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../dashboard/index.html'));
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  QA Analytics Platform                 ║`);
  console.log(`║  Dashboard: http://localhost:${PORT}       ║`);
  console.log(`║  API:       http://localhost:${PORT}/api   ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});

module.exports = { app, db };
