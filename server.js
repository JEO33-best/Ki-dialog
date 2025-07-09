// server.js
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let clients = [];

wss.on('connection', (ws) => {
  console.log('✅ Neuer Client verbunden');
  clients.push(ws);

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    console.log('📨 Nachricht:', data);

    // Nachricht an alle Clients weiterleiten
    if (data.type === "message") {
      clients.forEach(c => {
        if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({ type: "log", text: `🧑 ${data.text}` }));
        }
      });
    }

    // Beispiel für Befehle (Admin/Owner)
    if (data.type === "command") {
      clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({ type: "log", text: `⚙️ Befehl: ${data.command}` }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('❌ Client getrennt');
    clients = clients.filter(c => c !== ws);
  });
});
