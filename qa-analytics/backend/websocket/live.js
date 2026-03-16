'use strict';
// WebSocket live update server.
// Clients connect to ws://localhost:4000/live?suite=<suiteId>
// Server pushes JSON events whenever a run is ingested.

const { WebSocketServer } = require('ws');

// In-memory subscriber map: suiteId → Set<WebSocket>
const subscribers = new Map();

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {import('http').Server} httpServer
 */
function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  wss.on('connection', (ws, req) => {
    const url     = new URL(req.url, 'http://x');
    const suiteId = url.searchParams.get('suite') || '__all__';

    // Register subscriber
    if (!subscribers.has(suiteId)) subscribers.set(suiteId, new Set());
    subscribers.get(suiteId).add(ws);

    console.log(`[ws] Client connected — suite: ${suiteId} | active: ${countAll()}`);

    // Heartbeat ping
    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000);

    ws.on('close', () => {
      clearInterval(ping);
      subscribers.get(suiteId)?.delete(ws);
      console.log(`[ws] Client disconnected — suite: ${suiteId} | active: ${countAll()}`);
    });

    ws.on('error', () => {
      clearInterval(ping);
      subscribers.get(suiteId)?.delete(ws);
    });

    // Welcome message
    ws.send(JSON.stringify({ type: 'connected', suiteId, time: new Date().toISOString() }));
  });

  console.log('[ws] WebSocket server attached on /live');
}

/**
 * Broadcast an event to all subscribers of a suite.
 * Also broadcasts to '__all__' wildcard subscribers.
 * @param {string} suiteId
 * @param {object} payload
 */
function broadcastUpdate(suiteId, payload) {
  const message = JSON.stringify({ ...payload, suiteId, time: new Date().toISOString() });
  let sent = 0;

  for (const id of [suiteId, '__all__']) {
    const clients = subscribers.get(id);
    if (!clients) continue;
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
        sent++;
      }
    }
  }

  if (sent > 0) console.log(`[ws] Broadcast to ${sent} client(s) — suite: ${suiteId} | type: ${payload.type}`);
}

function countAll() {
  let n = 0;
  for (const set of subscribers.values()) n += set.size;
  return n;
}

module.exports = { attachWebSocket, broadcastUpdate };
