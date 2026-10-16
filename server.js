// Pregão do Boi Gordo — servidor do jogo (Node.js + Socket.IO)
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const CARDS = require("./cards");

// ---------------- parâmetros do jogo ----------------
const CFG = {
  contractSize: 330,        // arrobas por contrato (BGI B3)
  startPrice: 320,          // R$/@ inicial do futuro
  initialMargin: 15000,     // margem inicial por contrato (R$) — ilustrativa
  maintMargin: 8000,        // margem de manutenção por contrato (R$) — ilustrativa
  physicalArrobas: 660,     // estoque físico de cada pecuarista/frigorífico (= 2 contratos)
  specCapital: 45000,       // capital inicial do especulador (R$)
  specMax: 3,               // contratos máximos do especulador
  startBasis: 12,           // à vista abaixo do futuro no início (R$/@); converge a 0
  priceMin: 250,
  priceMax: 420,
};
const ROLE_PATTERN = ["pecuarista", "frigorifico", "especulador", "pecuarista", "frigorifico"];
const ROLES = ["pecuarista", "frigorifico", "especulador"];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
// Os arquivos das telas ficam na pasta "public". Se ela não existir (por exemplo, quando
// os arquivos foram enviados ao GitHub todos soltos na raiz), o jogo procura na própria raiz.
const fs = require("fs");
const PUB = fs.existsSync(path.join(__dirname, "public", "host.html")) ? path.join(__dirname, "public") : __dirname;
const PAGES = ["index.html", "host.html", "play.html", "style.css", "common.js"];
const missing = PAGES.filter((f) => !fs.existsSync(path.join(PUB, f)));
if (missing.length) console.error("ATENÇÃO: arquivos não encontrados:", missing.join(", "), "— procurados em", PUB);
const page = (f) => (req, res) => res.sendFile(path.join(PUB, f), (err) => err && res.status(404).send(`Arquivo ${f} não encontrado no servidor. Confira se ele foi enviado ao GitHub.`));

app.get("/", page("index.html"));
app.get("/professor", page("host.html"));
app.get("/j/:code", page("play.html"));
app.get("/jogar", page("play.html"));
app.get("/static/:file", (req, res, next) => (["style.css", "common.js"].includes(req.params.file) ? page(req.params.file)(req, res) : next()));
app.get("/qr.svg", async (req, res) => {
  const url = String(req.query.u || "").slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).send("url inválida");
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#232D5F", light: "#FFFFFF" } });
  res.type("image/svg+xml").send(svg);
});
app.get("/info", (req, res) => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === "IPv4" && !n.internal) ips.push(n.address);
  res.json({ ips, port: PORT });
});
app.get("/health", (req, res) => res.json({ ok: true, games: games.size }));

// ---------------- estado ----------------
const games = new Map();
const rnd = (n) => crypto.randomBytes(n).toString("hex");
function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c;
  do c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join("");
  while (games.has(c));
  return c;
}
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

function createGame() {
  const g = {
    code: newCode(), hostToken: rnd(16), createdAt: Date.now(), touched: Date.now(),
    phase: "lobby", round: 0, totalRounds: 8,
    price: CFG.startPrice, spot: CFG.startPrice - CFG.startBasis,
    history: [{ round: 0, price: CFG.startPrice, spot: CFG.startPrice - CFG.startBasis, move: 0, card: null }],
    deck: [], card: null, lastMove: 0, players: new Map(), roleSeq: 0,
  };
  games.set(g.code, g);
  return g;
}
function addPlayer(g, name, forceRole) {
  const role = forceRole || ROLE_PATTERN[g.roleSeq++ % ROLE_PATTERN.length];
  const p = {
    id: rnd(6), token: rnd(16), name, role, connected: true, joinedAt: Date.now(),
    pos: 0, pendingPos: null, margin: 0, aportes: 0, ajusteTotal: 0, lastAjuste: 0,
    hedgeChosen: false, liquidated: false, forced: false, marginCall: null, marginCalls: 0,
    vote: null, points: 0, correct: 0, log: [],
  };
  setupRole(p);
  g.players.set(p.id, p);
  return p;
}
function setupRole(p) {
  p.pos = 0; p.pendingPos = null; p.hedgeChosen = p.role === "especulador";
  p.margin = p.role === "especulador" ? CFG.specCapital : 0;
}

// ---------------- visões ----------------
function publicState(g) {
  const ps = [...g.players.values()];
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, ps.filter((p) => p.role === r).length]));
  return {
    code: g.code, phase: g.phase, round: g.round, totalRounds: g.totalRounds,
    price: g.price, spot: g.spot, lastMove: g.lastMove, history: g.history,
    card: g.card ? { titulo: g.card.titulo, texto: g.card.texto, inspiracao: g.card.inspiracao, porque: g.phase === "result" || g.phase === "end" ? g.card.porque : null } : null,
    players: ps.length, roleCounts,
    voted: ps.filter((p) => p.vote).length,
    hedgeDone: ps.filter((p) => p.hedgeChosen).length,
    pendingCalls: ps.filter((p) => p.marginCall).length,
    cfg: CFG,
  };
}
function playerView(p) {
  return {
    id: p.id, name: p.name, role: p.role, pos: p.pos, pendingPos: p.pendingPos, margin: p.margin, aportes: p.aportes,
    ajusteTotal: p.ajusteTotal, lastAjuste: p.lastAjuste, hedgeChosen: p.hedgeChosen, liquidated: p.liquidated, forced: p.forced,
    marginCall: p.marginCall, marginCalls: p.marginCalls, vote: p.vote, points: p.points, correct: p.correct, log: p.log.slice(-12),
  };
}
function results(g) {
  const P = g.price, A = CFG.physicalArrobas;
  const rows = [...g.players.values()].map((p) => {
    const r = { id: p.id, name: p.name, role: p.role, points: p.points, correct: p.correct, ajusteTotal: p.ajusteTotal, aportes: p.aportes, marginCalls: p.marginCalls, liquidated: p.liquidated, forced: p.forced, hedge: p.initialPos || 0 };
    if (p.role === "pecuarista") { r.fisico = A * P; r.total = A * P + p.ajusteTotal; r.efetivo = r.total / A; }
    else if (p.role === "frigorifico") { r.fisico = A * P; r.total = A * P - p.ajusteTotal; r.efetivo = r.total / A; }
    else { r.total = p.ajusteTotal; r.saldoFinal = p.margin; }
    return r;
  });
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { finalPrice: P, startPrice: CFG.startPrice, rows };
}
function broadcast(g) {
  g.touched = Date.now();
  const pub = publicState(g);
  const res = g.phase === "end" ? results(g) : null;
  io.to("host:" + g.code).emit("host:state", { ...pub, results: res, list: [...g.players.values()].map((p) => ({ ...playerView(p), connected: p.connected })) });
  for (const p of g.players.values()) io.to("p:" + p.id).emit("player:state", { pub, me: playerView(p), results: res });
}

// ---------------- mecânica ----------------
function startRound(g) {
  g.round += 1;
  if (!g.deck.length) g.deck = shuffle(CARDS);
  g.card = g.deck.shift();
  g.phase = "news";
  for (const p of g.players.values()) { p.vote = null; p.pendingPos = null; }
}
function reveal(g) {
  const prev = g.price;
  let move = Math.round(g.card.move * (0.75 + Math.random() * 0.5));
  if (Math.abs(move) < 2) move = Math.sign(g.card.move) * 2;
  let next = Math.min(CFG.priceMax, Math.max(CFG.priceMin, prev + move));
  move = next - prev;
  g.price = next; g.lastMove = move;
  const basis = Math.round(CFG.startBasis * (1 - g.round / g.totalRounds));
  g.spot = next - basis;
  g.history.push({ round: g.round, price: next, spot: g.spot, move, card: g.card.titulo });
  const dir = move > 0 ? "sobe" : move < 0 ? "cai" : null;

  for (const p of g.players.values()) {
    // especulador: aplica a nova posição escolhida (limitada pela margem disponível)
    if (p.role === "especulador" && p.pendingPos !== null && !p.marginCall) {
      let want = Math.max(-CFG.specMax, Math.min(CFG.specMax, p.pendingPos | 0));
      const maxByMargin = Math.floor(p.margin / CFG.initialMargin);
      if (Math.abs(want) > Math.abs(p.pos) && Math.abs(want) > maxByMargin) want = Math.sign(want) * Math.max(Math.abs(p.pos), Math.min(Math.abs(want), maxByMargin));
      p.pos = want;
    }
    p.pendingPos = null;
    const aj = (next - prev) * CFG.contractSize * p.pos;
    p.lastAjuste = aj; p.ajusteTotal += aj; p.margin += aj;
    if (p.vote && dir) { if (p.vote === dir) { p.points += 100; p.correct += 1; } }
    p.log.push({ round: g.round, price: next, move, pos: p.pos, ajuste: aj, saldo: p.margin, vote: p.vote, hit: p.vote && p.vote === dir });
    if (p.pos !== 0 && p.margin < CFG.maintMargin * Math.abs(p.pos)) {
      p.marginCall = { need: CFG.initialMargin * Math.abs(p.pos) - p.margin, round: g.round };
      p.marginCalls += 1;
    }
  }
  g.phase = "result";
}
function resolveCall(p, action) {
  if (!p.marginCall) return;
  if (action === "depositar") { p.margin += p.marginCall.need; p.aportes += p.marginCall.need; }
  else { p.pos = 0; p.liquidated = true; }
  p.log.push({ round: p.marginCall.round, call: action });
  p.marginCall = null;
}
function advance(g) {
  for (const p of g.players.values()) if (p.marginCall) { p.forced = true; resolveCall(p, "zerar"); }
  if (g.round >= g.totalRounds) { g.phase = "end"; g.card = g.card; return; }
  startRound(g);
}

// ---------------- sockets ----------------
io.on("connection", (socket) => {
  socket.on("host:create", (opts, ack) => {
    const g = createGame();
    socket.join("host:" + g.code);
    socket.data = { host: g.code };
    ack && ack({ code: g.code, token: g.hostToken });
    broadcast(g);
  });
  socket.on("host:resume", ({ code, token }, ack) => {
    const g = games.get(String(code || "").toUpperCase());
    if (!g || g.hostToken !== token) return ack && ack({ ok: false });
    socket.join("host:" + g.code);
    socket.data = { host: g.code };
    ack && ack({ ok: true });
    broadcast(g);
  });
  const hostGame = () => (socket.data && socket.data.host ? games.get(socket.data.host) : null);
  socket.on("host:action", (a) => {
    const g = hostGame();
    if (!g || !a) return;
    switch (a.type) {
      case "rounds": if (g.phase === "lobby") g.totalRounds = [6, 8, 10, 12].includes(a.value) ? a.value : 8; break;
      case "role": {
        const p = g.players.get(a.id);
        if (p && g.phase === "lobby") { p.role = ROLES[(ROLES.indexOf(p.role) + 1) % 3]; setupRole(p); }
        break;
      }
      case "kick": if (g.phase === "lobby") g.players.delete(a.id); break;
      case "start": if (g.phase === "lobby" && g.players.size) g.phase = "hedge"; break;
      case "open": if (g.phase === "hedge") {
        for (const p of g.players.values()) if (!p.hedgeChosen) { p.hedgeChosen = true; } // quem não escolheu fica sem hedge
        for (const p of g.players.values()) { p.initialPos = p.pos; }
        startRound(g);
      } break;
      case "reveal": if (g.phase === "news") reveal(g); break;
      case "next": if (g.phase === "result") advance(g); break;
      case "restart": {
        g.phase = "lobby"; g.round = 0; g.price = CFG.startPrice; g.spot = CFG.startPrice - CFG.startBasis; g.lastMove = 0;
        g.history = [{ round: 0, price: g.price, spot: g.spot, move: 0, card: null }]; g.deck = []; g.card = null;
        for (const p of g.players.values()) {
          Object.assign(p, { aportes: 0, ajusteTotal: 0, lastAjuste: 0, liquidated: false, forced: false, marginCall: null, marginCalls: 0, vote: null, points: 0, correct: 0, log: [], initialPos: 0 });
          setupRole(p);
        }
      } break;
    }
    broadcast(g);
  });

  socket.on("player:join", ({ code, name, token }, ack) => {
    const g = games.get(String(code || "").toUpperCase().trim());
    if (!g) return ack && ack({ ok: false, error: "Código de jogo não encontrado." });
    let p = token ? [...g.players.values()].find((x) => x.token === token) : null;
    if (!p) {
      name = clean(name, 24);
      if (!name) return ack && ack({ ok: false, error: "Digite seu nome ou o nome do grupo." });
      if (g.players.size >= 200) return ack && ack({ ok: false, error: "Sala cheia." });
      if (g.phase === "end") return ack && ack({ ok: false, error: "Esta partida já terminou." });
      p = addPlayer(g, name, g.phase === "lobby" ? null : "especulador");
    }
    p.connected = true;
    socket.join("p:" + p.id);
    socket.data = { code: g.code, pid: p.id };
    ack && ack({ ok: true, token: p.token, id: p.id, code: g.code });
    broadcast(g);
  });
  const me = () => {
    const d = socket.data || {};
    const g = d.code && games.get(d.code);
    return g ? { g, p: g.players.get(d.pid) } : {};
  };
  socket.on("player:hedge", (n) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "hedge" || p.role === "especulador") return;
    const k = Math.max(0, Math.min(2, n | 0));
    p.pos = p.role === "pecuarista" ? -k : k;
    p.margin = CFG.initialMargin * k;
    p.hedgeChosen = true;
    broadcast(g);
  });
  socket.on("player:vote", (v) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "news" || !["sobe", "cai"].includes(v)) return;
    p.vote = v;
    broadcast(g);
  });
  socket.on("player:position", (n) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "news" || p.role !== "especulador") return;
    p.pendingPos = Math.max(-CFG.specMax, Math.min(CFG.specMax, n | 0));
    broadcast(g);
  });
  socket.on("player:margin", (action) => {
    const { g, p } = me();
    if (!g || !p || g.phase !== "result" || !p.marginCall) return;
    resolveCall(p, action === "depositar" ? "depositar" : "zerar");
    broadcast(g);
  });
  socket.on("disconnect", () => {
    const { g, p } = me();
    if (g && p) { p.connected = false; broadcast(g); }
  });
});

// limpa partidas paradas há mais de 8 horas
setInterval(() => { const lim = Date.now() - 8 * 3600e3; for (const [c, g] of games) if (g.touched < lim) games.delete(c); }, 600e3);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pregão do Boi Gordo rodando em http://localhost:${PORT}/professor`));
