const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v, dec = 0) => (v < 0 ? "– " : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const sbrl = (v) => (v > 0 ? "+ " : "") + brl(v);
const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const ROLE_NAME = { pecuarista: "Pecuarista", frigorifico: "Frigorífico", especulador: "Especulador" };
const ROLE_ICON = { pecuarista: "🐂", frigorifico: "🏭", especulador: "📈" };
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function posText(role, pos) {
  if (!pos) return "Sem posição no futuro";
  const n = Math.abs(pos);
  return (pos > 0 ? "Comprado" : "Vendido") + " em " + n + " contrato" + (n > 1 ? "s" : "") + " (" + n * 330 + " @)";
}
// gráfico de linhas: futuro x à vista
function chartSVG(history, opts = {}) {
  const W = opts.w || 640, H = opts.h || 260, P = { l: 48, r: 16, t: 16, b: 30 };
  const n = Math.max((opts.total || history.length - 1), history.length - 1, 1);
  const vals = history.flatMap((h) => [h.price, h.spot]);
  const span = Math.max(...vals) - Math.min(...vals);
  const step = span > 60 ? 20 : 10;
  let lo = Math.floor((Math.min(...vals) - 4) / step) * step, hi = Math.ceil((Math.max(...vals) + 4) / step) * step;
  if (hi - lo < 2 * step) hi = lo + 2 * step;
  const x = (i) => P.l + (i / n) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let g = "";
  for (let v = lo; v <= hi; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E3E7EE"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5F6B7A">${Math.round(v)}</text>`;
  for (let i = 0; i <= n; i++) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#5F6B7A">${i === 0 ? "Início" : i}</text>`;
  const line = (k, c, d) => `<polyline fill="none" stroke="${c}" stroke-width="3" ${d ? 'stroke-dasharray="6 5"' : ""} points="${history.map((h, i) => x(i) + "," + y(h[k])).join(" ")}"/>` +
    history.map((h, i) => `<circle cx="${x(i)}" cy="${y(h[k])}" r="4" fill="${c}"/>`).join("");
  const last = history[history.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Preço futuro e à vista por rodada">${g}${line("spot", "#00AACA", true)}${line("price", "#232D5F")}
    <text x="${x(history.length - 1) + (history.length - 1 < n / 2 ? 10 : -10)}" y="${y(last.price) - 12}" text-anchor="${history.length - 1 < n / 2 ? "start" : "end"}" font-size="14" font-weight="700" fill="#232D5F" stroke="#fff" stroke-width="4" paint-order="stroke">R$ ${last.price}</text></svg>
    <div class="small muted" style="margin-top:6px"><b style="color:#232D5F">━</b> Futuro (B3) &nbsp; <b style="color:#00AACA">╍</b> Indicador à vista — converge ao futuro no vencimento</div>`;
}

const num = (v) => (v > 0 ? "+" : v < 0 ? "–" : "") + Math.abs(v).toLocaleString("pt-BR");
