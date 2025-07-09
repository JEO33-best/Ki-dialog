const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
  console.log('✅ Neuer Client verbunden');

  ws.on('message', (message) => {
    console.log('📨 Nachricht:', message);
    ws.send(JSON.stringify({ type: "log", text: "KI: Nachricht erhalten ✅" }));
  });

  ws.on('close', () => {
    console.log('❌ Client getrennt');
  });
});
