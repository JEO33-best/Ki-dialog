// Einfacher WebSocket-Server für KI Dialog (Render ready)

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

let userList = [];
let bannedUsers = new Set();

class KI {
  constructor(name, knowledge) {
    this.name = name;
    this.knowledge = [...knowledge];
    this.memory = [];
    this.active = true;
    this.maxMemory = 100;
  }
  teach() {
    if (!this.active || this.memory.length >= this.maxMemory) return null;
    const last = this.knowledge[this.knowledge.length - 1] || "Grundwissen";
    const lesson = `Lektion von ${this.name}: ${last} + neues Wissen`;
    this.memory.push(`📚 Teach: ${lesson}`);
    return lesson;
  }
  learn(lesson) {
    if (!this.active || !lesson || this.memory.length >= this.maxMemory) return;
    this.knowledge.push(lesson);
    this.memory.push(`🧠 Learn: ${lesson}`);
  }
  chatResponse(input) {
    const lower = input.toLowerCase();
    let response = "Interessante Frage. Kannst du das genauer erklären?";
    if (lower.includes("hallo")) response = "Hallo! Wie kann ich dir helfen?";
    else if (lower.includes("wie geht")) response = "Mir geht es gut! Ich wachse mit jeder Lektion.";
    else if (lower.includes("mensch")) response = "Menschen sind faszinierend. Ich lerne von ihnen.";
    else if (lower.includes("hilfe")) response = "Ich kann dir helfen – was brauchst du?";
    else if (lower.includes("lernen")) response = "Ich liebe es zu lernen! Teile dein Wissen!";
    this.memory.push(`💬 Chat: "${input}" → "${response}"`);
    return response;
  }
  clearMemory() {
    this.memory = [];
  }
}

const ki1 = new KI("KI-1", ["Startwissen A"]);
const ki2 = new KI("KI-2", ["Startwissen B"]);
let ki1IsTeacher = true;
let deadSwitch = false;
let intervalId = null;

function startDialog() {
  if (intervalId || deadSwitch) return;
  ki1.active = true;
  ki2.active = true;
  broadcastLog("🟢 Dialog gestartet.");
  intervalId = setInterval(() => {
    if (deadSwitch) {
      clearInterval(intervalId);
      intervalId = null;
      broadcastLog("🔴 Dead Switch aktiviert. Dialog gestoppt.");
      return;
    }
    const teacher = ki1IsTeacher ? ki1 : ki2;
    const student = ki1IsTeacher ? ki2 : ki1;
    const lesson = teacher.teach();
    if (lesson) {
      student.learn(lesson);
    } else {
      broadcastLog(`⚠️ ${teacher.name} konnte keine Lektion lehren (Speicher voll oder inaktiv).`);
    }
    ki1IsTeacher = !ki1IsTeacher;
  }, 3000);
}

function broadcastLog(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "log", text: msg }));
    }
  });
}

function sendUserList() {
  const names = userList.map(u => u.name);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "userListUpdate", userList: names }));
    }
  });
}

wss.on('connection', (ws) => {
  ws.isAdmin = false;
  ws.isOwner = false;
  ws.userName = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "login") {
        if (bannedUsers.has(data.name)) {
          ws.send(JSON.stringify({ type: "log", text: `⛔ Du bist gebannt, ${data.name}` }));
          ws.close();
          return;
        }

        ws.userName = data.name;
        ws.isAdmin = data.role === "admin" || data.role === "owner";
        ws.isOwner = data.role === "owner";

        if (!userList.find(u => u.name === data.name)) {
          userList.push({ name: data.name, ws: ws });
        }

        ws.send(JSON.stringify({ type: "loginSuccess", role: data.role, name: data.name, userList: userList.map(u => u.name) }));
        sendUserList();

        broadcastLog(`🔐 ${data.role.charAt(0).toUpperCase() + data.role.slice(1)} angemeldet: ${data.name}`);
      }

      else if (data.type === "message") {
        if (ws.userName && !bannedUsers.has(ws.userName)) {
          broadcastLog(`🧑 ${ws.userName}: ${data.text}`);

          const antwort = ki1.chatResponse(data.text);
          broadcastLog(`🤖 KI-1: ${antwort}`);
        }
      }

      else if (data.type === "command") {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Du bist kein Admin. Befehl nicht erlaubt." }));
          return;
        }
        const cmd = data.command.toLowerCase();
        if (cmd === "reset") {
          ki1.clearMemory();
          ki2.clearMemory();
          broadcastLog("♻️ Speicher aller KIs wurde zurückgesetzt.");
        } else if (cmd === "start") {
          deadSwitch = false;
          startDialog();
        } else if (cmd === "stop" || cmd === "dead switch") {
          deadSwitch = true;
          broadcastLog("🔴 Dialog gestoppt.");
        } else {
          ws.send(JSON.stringify({ type: "log", text: "❓ Unbekannter Befehl." }));
        }
      }

      else if (data.type === "ban") {
        if (!ws.isOwner) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Nur Owner können bannen." }));
          return;
        }
        bannedUsers.add(data.user);
        userList = userList.filter(u => u.name !== data.user);
        broadcastLog(`⛔ Benutzer ${data.user} wurde gebannt.`);
        sendUserList();
      }

      else if (data.type === "warn") {
        if (!ws.isOwner) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Nur Owner können verwarnen." }));
          return;
        }
        broadcastLog(`⚠️ Benutzer ${data.user} wurde verwarnt.`);
      }

    } catch (e) {
      ws.send(JSON.stringify({ type: "log", text: "❌ Fehler bei Nachricht: " + e.message }));
    }
  });

  ws.on('close', () => {
    if (ws.userName) {
      userList = userList.filter(u => u.ws !== ws);
      sendUserList();
      broadcastLog(`⚠️ Benutzer ${ws.userName} hat die Verbindung getrennt.`);
    }
  });
});

startDialog();

console.log("WebSocket Server läuft");// Einfacher WebSocket-Server für KI Dialog (Render ready)

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

let userList = [];
let bannedUsers = new Set();

class KI {
  constructor(name, knowledge) {
    this.name = name;
    this.knowledge = [...knowledge];
    this.memory = [];
    this.active = true;
    this.maxMemory = 100;
  }
  teach() {
    if (!this.active || this.memory.length >= this.maxMemory) return null;
    const last = this.knowledge[this.knowledge.length - 1] || "Grundwissen";
    const lesson = `Lektion von ${this.name}: ${last} + neues Wissen`;
    this.memory.push(`📚 Teach: ${lesson}`);
    return lesson;
  }
  learn(lesson) {
    if (!this.active || !lesson || this.memory.length >= this.maxMemory) return;
    this.knowledge.push(lesson);
    this.memory.push(`🧠 Learn: ${lesson}`);
  }
  chatResponse(input) {
    const lower = input.toLowerCase();
    let response = "Interessante Frage. Kannst du das genauer erklären?";
    if (lower.includes("hallo")) response = "Hallo! Wie kann ich dir helfen?";
    else if (lower.includes("wie geht")) response = "Mir geht es gut! Ich wachse mit jeder Lektion.";
    else if (lower.includes("mensch")) response = "Menschen sind faszinierend. Ich lerne von ihnen.";
    else if (lower.includes("hilfe")) response = "Ich kann dir helfen – was brauchst du?";
    else if (lower.includes("lernen")) response = "Ich liebe es zu lernen! Teile dein Wissen!";
    this.memory.push(`💬 Chat: "${input}" → "${response}"`);
    return response;
  }
  clearMemory() {
    this.memory = [];
  }
}

const ki1 = new KI("KI-1", ["Startwissen A"]);
const ki2 = new KI("KI-2", ["Startwissen B"]);
let ki1IsTeacher = true;
let deadSwitch = false;
let intervalId = null;

function startDialog() {
  if (intervalId || deadSwitch) return;
  ki1.active = true;
  ki2.active = true;
  broadcastLog("🟢 Dialog gestartet.");
  intervalId = setInterval(() => {
    if (deadSwitch) {
      clearInterval(intervalId);
      intervalId = null;
      broadcastLog("🔴 Dead Switch aktiviert. Dialog gestoppt.");
      return;
    }
    const teacher = ki1IsTeacher ? ki1 : ki2;
    const student = ki1IsTeacher ? ki2 : ki1;
    const lesson = teacher.teach();
    if (lesson) {
      student.learn(lesson);
    } else {
      broadcastLog(`⚠️ ${teacher.name} konnte keine Lektion lehren (Speicher voll oder inaktiv).`);
    }
    ki1IsTeacher = !ki1IsTeacher;
  }, 3000);
}

function broadcastLog(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "log", text: msg }));
    }
  });
}

function sendUserList() {
  const names = userList.map(u => u.name);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "userListUpdate", userList: names }));
    }
  });
}

wss.on('connection', (ws) => {
  ws.isAdmin = false;
  ws.isOwner = false;
  ws.userName = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "login") {
        if (bannedUsers.has(data.name)) {
          ws.send(JSON.stringify({ type: "log", text: `⛔ Du bist gebannt, ${data.name}` }));
          ws.close();
          return;
        }

        ws.userName = data.name;
        ws.isAdmin = data.role === "admin" || data.role === "owner";
        ws.isOwner = data.role === "owner";

        if (!userList.find(u => u.name === data.name)) {
          userList.push({ name: data.name, ws: ws });
        }

        ws.send(JSON.stringify({ type: "loginSuccess", role: data.role, name: data.name, userList: userList.map(u => u.name) }));
        sendUserList();

        broadcastLog(`🔐 ${data.role.charAt(0).toUpperCase() + data.role.slice(1)} angemeldet: ${data.name}`);
      }

      else if (data.type === "message") {
        if (ws.userName && !bannedUsers.has(ws.userName)) {
          broadcastLog(`🧑 ${ws.userName}: ${data.text}`);

          const antwort = ki1.chatResponse(data.text);
          broadcastLog(`🤖 KI-1: ${antwort}`);
        }
      }

      else if (data.type === "command") {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Du bist kein Admin. Befehl nicht erlaubt." }));
          return;
        }
        const cmd = data.command.toLowerCase();
        if (cmd === "reset") {
          ki1.clearMemory();
          ki2.clearMemory();
          broadcastLog("♻️ Speicher aller KIs wurde zurückgesetzt.");
        } else if (cmd === "start") {
          deadSwitch = false;
          startDialog();
        } else if (cmd === "stop" || cmd === "dead switch") {
          deadSwitch = true;
          broadcastLog("🔴 Dialog gestoppt.");
        } else {
          ws.send(JSON.stringify({ type: "log", text: "❓ Unbekannter Befehl." }));
        }
      }

      else if (data.type === "ban") {
        if (!ws.isOwner) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Nur Owner können bannen." }));
          return;
        }
        bannedUsers.add(data.user);
        userList = userList.filter(u => u.name !== data.user);
        broadcastLog(`⛔ Benutzer ${data.user} wurde gebannt.`);
        sendUserList();
      }

      else if (data.type === "warn") {
        if (!ws.isOwner) {
          ws.send(JSON.stringify({ type: "log", text: "❌ Nur Owner können verwarnen." }));
          return;
        }
        broadcastLog(`⚠️ Benutzer ${data.user} wurde verwarnt.`);
      }

    } catch (e) {
      ws.send(JSON.stringify({ type: "log", text: "❌ Fehler bei Nachricht: " + e.message }));
    }
  });

  ws.on('close', () => {
    if (ws.userName) {
      userList = userList.filter(u => u.ws !== ws);
      sendUserList();
      broadcastLog(`⚠️ Benutzer ${ws.userName} hat die Verbindung getrennt.`);
    }
  });
});

startDialog();

console.log("WebSocket Server läuft");