"use strict";

/* ------------------------------------------------------------------ *
 * SUDECO — Gestão de Contratos (front-end)
 * Os dados vivem num store em memória do navegador (assets/store.js),
 * semeado por data/seed.json. Identificadores em EN-US, interface em pt-BR.
 * ------------------------------------------------------------------ */

const REF_DATE = new Date("2026-09-29T00:00:00"); // data de referência dos prazos

/* ---- helpers ---- */
const $ = (sel, root = document) => root.querySelector(sel);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlShort = (v) => {
  if (v == null) return "—";
  if (v >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mi";
  if (v >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return brl.format(v);
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = (s) => String(s || "").replace(/ /g, " ").trim();
function fmtDate(iso) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? null : Math.round((d - REF_DATE) / 86400000);
}
function initials(name) {
  const p = name.trim().split(/\s+/);
  return ((p[0] || "")[0] || "") + ((p[1] || "")[0] || "");
}
const isOpen = (p) => !/finaliz/i.test(p.status || "");

function expiryClass(days, indefinite) {
  if (indefinite) return { cls: "b-neutral", ink: "--neutral-ink", label: "Indeterminado" };
  if (days == null) return { cls: "b-neutral", ink: "--neutral-ink", label: "—" };
  if (days < 0) return { cls: "b-crit", ink: "--crit-ink", label: "Vencido" };
  if (days <= 90) return { cls: "b-crit", ink: "--crit-ink", label: "Crítico" };
  if (days <= 180) return { cls: "b-serious", ink: "--serious-ink", label: "Atenção" };
  if (days <= 365) return { cls: "b-warn", ink: "--warn-ink", label: "Monitorar" };
  return { cls: "b-good", ink: "--good-ink", label: "Regular" };
}

function sameCompany(a, b) {
  a = (a || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  b = (b || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  if (!a || !b) return false;
  const wa = a.split(" ")[0], wb = b.split(" ")[0];
  return a.includes(b.slice(0, 10)) || b.includes(a.slice(0, 10)) || (wa.length > 3 && wa === wb);
}
const normNum = (n) => (n || "").replace(/^0+/, "").trim();
const penaltiesForContract = (c) =>
  STATE.penalties.filter((p) => sameCompany(p.company, c.company) && normNum(p.contract) === normNum(c.number));
const extensionsForContract = (c) =>
  STATE.extensions
    .filter((e) => e.contract_id === c.id)
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

/* ---- data client ----
 * Toda leitura/escrita passa pelo store em memória (assets/store.js),
 * inicializado no boot() a partir de data/seed.json. As edições valem só
 * naquela aba e voltam ao original ao recarregar a página. */
let STORE = null;
async function api(path, opts = {}) {
  return STORE.handle(path, opts);
}

/* ---- state ---- */
const STATE = { contracts: [], penalties: [], extensions: [] };
let view = "dashboard";
const cFilters = { q: "", category: "", owner: "", expiry: "" };
const pFilters = { q: "", status: "", type: "" };

function enrich() {
  STATE.contracts.forEach((c) => {
    c._days = c.indefinite_end ? null : daysUntil(c.end_date);
  });
}
async function loadAll() {
  const [contracts, penalties, extensions] = await Promise.all([
    api("/contracts"), api("/penalties"), api("/extensions"),
  ]);
  STATE.contracts = contracts;
  STATE.penalties = penalties;
  STATE.extensions = extensions;
  enrich();
}
async function reload(reopenContractId) {
  await loadAll();
  render();
  if (reopenContractId != null) openContract(reopenContractId);
}

/* ---- icons ---- */
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  contracts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
  penalties: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
};

const ROLE_OPTIONS = ["Gestor Titular", "Gestor Substituto", "Gestora Titular", "Gestora Substituta", "Fiscal Titular", "Fiscal Substituto", "Fiscal Substituta", "Gestor", "Gestora", "Fiscal"];
function peopleRowHTML(person) {
  const p = person || { name: "", role: "Fiscal Titular" };
  const known = ROLE_OPTIONS.includes(p.role);
  const opts = (!known && p.role ? `<option selected>${esc(p.role)}</option>` : "") +
    ROLE_OPTIONS.map((r) => `<option ${p.role === r ? "selected" : ""}>${esc(r)}</option>`).join("");
  return `<div class="pe-row"><input class="pe-name" placeholder="Nome do servidor" value="${esc(p.name)}"><select class="pe-role">${opts}</select><button type="button" class="pe-del" aria-label="Remover">${ICONS.x}</button></div>`;
}

function extensionRowHTML(ext) {
  const e = ext || { start_date: "", end_date: "", note: "" };
  return `<div class="ex-row" data-id="${e.id ?? ""}">
    <label class="ex-f"><span>Início</span><input type="date" class="ex-start" value="${esc(e.start_date || "")}"></label>
    <label class="ex-f"><span>Fim</span><input type="date" class="ex-end" value="${esc(e.end_date || "")}"></label>
    <input class="ex-note" placeholder="Observação (ex.: 1º Termo Aditivo)" value="${esc(e.note || "")}">
    <button type="button" class="pe-del" aria-label="Remover prorrogação">${ICONS.x}</button>
  </div>`;
}

function eventRowHTML(ev) {
  const e = ev || { date: "", text: "" };
  return `<div class="ev-row">
    <input type="date" class="ev-date" value="${esc(e.date || "")}" aria-label="Data do evento">
    <textarea class="ev-text" rows="2" placeholder="Descrição do evento (texto livre)">${esc(e.text || "")}</textarea>
    <button type="button" class="pe-del" aria-label="Remover evento">${ICONS.x}</button>
  </div>`;
}

const NAV = [
  { id: "dashboard", label: "Painel", icon: "dashboard" },
  { id: "contracts", label: "Contratos", icon: "contracts", count: () => STATE.contracts.length },
  { id: "penalties", label: "Penalidades", icon: "penalties", count: () => STATE.penalties.length },
];

function renderNav() {
  $("#nav").innerHTML = NAV.map((n) =>
    `<button data-v="${n.id}" class="${n.id === view ? "active" : ""}">${ICONS[n.icon]}<span>${n.label}</span>${n.count ? `<span class="count">${n.count()}</span>` : ""}</button>`
  ).join("");
  $("#nav").querySelectorAll("button").forEach((b) => (b.onclick = () => { view = b.dataset.v; render(); }));
}

function render() {
  renderNav();
  $("#viewtitle").textContent = NAV.find((n) => n.id === view).label;
  if (view === "dashboard") renderDashboard();
  else if (view === "contracts") renderContracts();
  else renderPenalties();
  window.scrollTo(0, 0);
}

/* ---- charts ---- */
function bars(items, fmt) {
  const max = Math.max(...items.map((i) => i.v), 1);
  return `<div class="chart">` + items.map((i) =>
    `<div class="b-row"><div class="b-lab" title="${esc(i.k)}">${esc(i.k)}</div><div class="b-track"><div class="b-fill" style="width:${Math.max(3, (i.v / max) * 100)}%"></div></div><div class="b-val">${fmt ? fmt(i.v) : i.v}</div></div>`
  ).join("") + `</div>`;
}

/* ---- dashboard ---- */
function renderDashboard() {
  const cs = STATE.contracts;
  const totalValue = cs.reduce((s, c) => s + (c.current_value || 0), 0);
  const monthly = cs.reduce((s, c) => s + (c.monthly_value || 0), 0);
  const dueSoon = cs.filter((c) => c._days != null && c._days >= 0 && c._days <= 90).length;
  const extendable = cs.filter((c) => c.extendable === true).length;
  const openPenalties = STATE.penalties.filter(isOpen).length;

  const catMap = {};
  cs.forEach((c) => { const t = clean(c.category) || "—"; catMap[t] = (catMap[t] || 0) + 1; });
  const byCategory = Object.entries(catMap).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 8);

  const infMap = {};
  STATE.penalties.forEach((p) => { const t = p.infraction_type || "—"; infMap[t] = (infMap[t] || 0) + 1; });
  const byInfraction = Object.entries(infMap).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 7);

  const upcoming = cs.filter((c) => c._days != null).sort((a, b) => a._days - b._days).slice(0, 8);

  $("#content").innerHTML = `
  <div class="viewhead"><p>Visão geral da carteira de contratos vigentes e das penalidades em acompanhamento.</p></div>
  <div class="note">${ICONS.info}<div><b>Campos calculados automaticamente.</b> Os dias até o fim da vigência, os alertas e os totais são gerados pelo sistema a partir das datas — sem cálculo manual. Data de referência: 29/09/2026.</div></div>
  <div class="kpis">
    <div class="kpi"><div class="lab">Contratos ativos</div><div class="val tnum">${cs.length}</div><div class="sub">${brlShort(monthly)}/mês em custeio</div></div>
    <div class="kpi"><div class="lab">Valor atual total</div><div class="val">${brlShort(totalValue)}</div><div class="sub">soma dos valores vigentes</div></div>
    <div class="kpi ${dueSoon ? "alert" : ""}"><div class="lab"><span class="dot" style="background:var(--crit-ink)"></span>Vencem em 90 dias</div><div class="val tnum">${dueSoon}</div><div class="sub">exigem ação imediata</div></div>
    <div class="kpi"><div class="lab">Podem prorrogar</div><div class="val tnum">${extendable}</div><div class="sub">de ${cs.length} contratos</div></div>
    <div class="kpi"><div class="lab"><span class="dot" style="background:var(--warn-ink)"></span>Penalidades abertas</div><div class="val tnum">${openPenalties}</div><div class="sub">de ${STATE.penalties.length} no total</div></div>
  </div>
  <div class="grid2">
    <div class="card">
      <div class="hd"><h3>Vencimentos próximos</h3><span class="meta">clique para abrir</span></div>
      <div class="bd"><div class="venc">${upcoming.map((c) => {
        const s = expiryClass(c._days, false);
        return `<div class="row" data-c="${c.id}"><div class="bar" style="background:var(${s.ink})"></div><div class="who"><b>${esc(c.company)}</b><small>Contrato ${esc(c.number)} · ${esc(clean(c.category))}</small></div><div class="days"><b style="color:var(${s.ink})">${c._days}</b><small>dias</small></div></div>`;
      }).join("")}</div></div>
    </div>
    <div class="card">
      <div class="hd"><h3>Contratos por tipo</h3><span class="meta">nº de contratos</span></div>
      <div class="bd">${bars(byCategory)}</div>
    </div>
  </div>
  <div style="height:16px"></div>
  <div class="grid2">
    <div class="card">
      <div class="hd"><h3>Penalidades por tipo de infração</h3><span class="meta">nº de processos</span></div>
      <div class="bd">${bars(byInfraction)}</div>
    </div>
    <div class="card">
      <div class="hd"><h3>Carteira por responsável</h3><span class="meta">contratos e valor</span></div>
      <div class="bd">${ownerBlock(cs)}</div>
    </div>
  </div>`;
  $("#content").querySelectorAll(".venc .row").forEach((r) => (r.onclick = () => openContract(+r.dataset.c)));
}
function ownerBlock(cs) {
  const map = {};
  cs.forEach((c) => { const o = c.owner || "—"; map[o] = map[o] || { n: 0, v: 0 }; map[o].n++; map[o].v += c.current_value || 0; });
  const items = Object.entries(map).map(([k, o]) => ({ k, n: o.n, v: o.v })).sort((a, b) => b.n - a.n);
  const max = Math.max(...items.map((i) => i.n), 1);
  return `<div class="chart">` + items.map((i) =>
    `<div class="b-row" style="grid-template-columns:96px 1fr auto"><div class="b-lab" title="${esc(i.k)}">${esc(i.k)}</div><div class="b-track"><div class="b-fill" style="width:${(i.n / max) * 100}%"></div></div><div class="b-val" style="white-space:nowrap">${i.n} · ${brlShort(i.v)}</div></div>`
  ).join("") + `</div>`;
}

/* ---- contracts ---- */
function filteredContracts() {
  return STATE.contracts.filter((c) => {
    if (cFilters.category && clean(c.category) !== cFilters.category) return false;
    if (cFilters.owner && c.owner !== cFilters.owner) return false;
    if (cFilters.expiry) {
      const d = c._days;
      if (cFilters.expiry === "90" && !(d != null && d >= 0 && d <= 90)) return false;
      if (cFilters.expiry === "180" && !(d != null && d >= 0 && d <= 180)) return false;
      if (cFilters.expiry === "365" && !(d != null && d >= 0 && d <= 365)) return false;
      if (cFilters.expiry === "indef" && !c.indefinite_end) return false;
    }
    if (cFilters.q) {
      const q = cFilters.q.toLowerCase();
      const hay = [c.company, c.number, c.process, c.object, c.category, c.owner].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a._days == null ? 1e9 : a._days) - (b._days == null ? 1e9 : b._days));
}
function renderContracts() {
  const categories = [...new Set(STATE.contracts.map((c) => clean(c.category)).filter(Boolean))].sort();
  const owners = [...new Set(STATE.contracts.map((c) => c.owner).filter(Boolean))].sort();
  $("#content").innerHTML = `
  <div class="viewhead"><p>${STATE.contracts.length} contratos vigentes. Busque, filtre e clique em uma linha para ver o detalhe.</p></div>
  <div class="toolbar">
    <div class="search">${ICONS.search}<input id="cq" placeholder="Buscar empresa, objeto, nº do contrato ou processo…" value="${esc(cFilters.q)}"></div>
    <select class="f" id="ccat"><option value="">Todos os tipos</option>${categories.map((t) => `<option ${cFilters.category === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <select class="f" id="cown"><option value="">Todos responsáveis</option>${owners.map((o) => `<option ${cFilters.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
    <select class="f" id="cexp">
      <option value="">Qualquer vigência</option>
      <option value="90" ${cFilters.expiry === "90" ? "selected" : ""}>Vence ≤ 90 dias</option>
      <option value="180" ${cFilters.expiry === "180" ? "selected" : ""}>Vence ≤ 180 dias</option>
      <option value="365" ${cFilters.expiry === "365" ? "selected" : ""}>Vence ≤ 1 ano</option>
      <option value="indef" ${cFilters.expiry === "indef" ? "selected" : ""}>Vigência indeterminada</option>
    </select>
    <button class="btn primary" id="newContract">${ICONS.plus}Novo contrato</button>
  </div>
  <div class="tablewrap"><div class="tscroll"><table>
    <thead><tr><th>Contrato</th><th>Prazo</th><th>Empresa / objeto</th><th>Tipo</th><th>Resp.</th><th style="text-align:right">Valor atual</th><th>Fim vigência</th></tr></thead>
    <tbody id="ctbody"></tbody>
  </table></div><div class="rcount" id="crc"></div></div>`;

  const draw = () => {
    const rows = filteredContracts();
    $("#ctbody").innerHTML = rows.map((c) => {
      const s = expiryClass(c._days, c.indefinite_end);
      const term = c.indefinite_end
        ? `<span class="badge b-neutral">Indeterminado</span>`
        : `<span class="badge ${s.cls}"><span class="d" style="background:var(${s.ink})"></span>${c._days < 0 ? "Vencido" : c._days + " d"}</span>`;
      return `<tr data-c="${c.id}">
        <td class="num mono">${esc(c.number)}${c.has_penalty ? ` <span class="pen-flag" title="Possui penalidade">${ICONS.alert}</span>` : ""}</td>
        <td>${term}</td>
        <td><span class="emp">${esc(c.company)}</span><span class="obj">${esc(clean(c.object))}</span></td>
        <td><span class="chip">${esc(clean(c.category) || "—")}</span></td>
        <td>${esc(c.owner || "—")}</td>
        <td class="val">${c.current_value != null ? brl.format(c.current_value) : "—"}</td>
        <td class="num mono">${c.indefinite_end ? "—" : fmtDate(c.end_date)}</td>
      </tr>`;
    }).join("");
    if (!rows.length) $("#ctbody").innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--faint)">Nenhum contrato encontrado com esses filtros.</td></tr>`;
    $("#crc").textContent = `${rows.length} de ${STATE.contracts.length} contratos`;
    $("#ctbody").querySelectorAll("tr[data-c]").forEach((r) => (r.onclick = () => openContract(+r.dataset.c)));
  };
  draw();
  $("#cq").oninput = (e) => { cFilters.q = e.target.value; draw(); };
  $("#ccat").onchange = (e) => { cFilters.category = e.target.value; draw(); };
  $("#cown").onchange = (e) => { cFilters.owner = e.target.value; draw(); };
  $("#cexp").onchange = (e) => { cFilters.expiry = e.target.value; draw(); };
  $("#newContract").onclick = () => openContractForm(null);
}

/* ---- penalties ---- */
function filteredPenalties() {
  return STATE.penalties.filter((p) => {
    if (pFilters.status === "open" && !isOpen(p)) return false;
    if (pFilters.status === "closed" && isOpen(p)) return false;
    if (pFilters.type && p.infraction_type !== pFilters.type) return false;
    if (pFilters.q) {
      const q = pFilters.q.toLowerCase();
      const hay = [p.company, p.contract, p.process, p.infraction, p.infraction_type, p.service_type].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function renderPenalties() {
  const types = [...new Set(STATE.penalties.map((p) => p.infraction_type).filter(Boolean))].sort();
  const open = STATE.penalties.filter(isOpen).length;
  $("#content").innerHTML = `
  <div class="viewhead"><p>${STATE.penalties.length} processos de penalidade — ${open} em andamento, ${STATE.penalties.length - open} finalizados.</p></div>
  <div class="toolbar">
    <div class="search">${ICONS.search}<input id="pq" placeholder="Buscar empresa, infração ou nº do processo…" value="${esc(pFilters.q)}"></div>
    <select class="f" id="pstatus"><option value="">Todos os status</option><option value="open" ${pFilters.status === "open" ? "selected" : ""}>Em andamento</option><option value="closed" ${pFilters.status === "closed" ? "selected" : ""}>Finalizado</option></select>
    <select class="f" id="ptype"><option value="">Todas as infrações</option>${types.map((t) => `<option ${pFilters.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <button class="btn primary" id="newPenalty">${ICONS.plus}Nova penalidade</button>
  </div>
  <div class="tablewrap"><div class="tscroll"><table>
    <thead><tr><th>Empresa</th><th>Contrato</th><th>Tipo de infração</th><th>Data</th><th>Próximo passo</th><th>Status</th></tr></thead>
    <tbody id="ptbody"></tbody>
  </table></div><div class="rcount" id="prc"></div></div>`;

  const draw = () => {
    const rows = filteredPenalties();
    $("#ptbody").innerHTML = rows.map((p) => {
      const open = isOpen(p);
      return `<tr data-p="${p.id}">
        <td><span class="emp">${esc(p.company)}</span></td>
        <td class="num mono">${esc(p.contract)}</td>
        <td>${esc(p.infraction_type || "—")}</td>
        <td class="num mono">${fmtDate(p.infraction_date)}</td>
        <td><span class="obj" style="max-width:260px">${esc(p.next_step || "—")}</span></td>
        <td><span class="badge ${open ? "b-warn" : "b-good"}"><span class="d" style="background:var(${open ? "--warn-ink" : "--good-ink"})"></span>${open ? "Em andamento" : "Finalizado"}</span></td>
      </tr>`;
    }).join("");
    if (!rows.length) $("#ptbody").innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--faint)">Nenhuma penalidade encontrada.</td></tr>`;
    $("#prc").textContent = `${rows.length} de ${STATE.penalties.length} processos`;
    $("#ptbody").querySelectorAll("tr[data-p]").forEach((r) => (r.onclick = () => openPenalty(+r.dataset.p)));
  };
  draw();
  $("#pq").oninput = (e) => { pFilters.q = e.target.value; draw(); };
  $("#pstatus").onchange = (e) => { pFilters.status = e.target.value; draw(); };
  $("#ptype").onchange = (e) => { pFilters.type = e.target.value; draw(); };
  $("#newPenalty").onclick = () => openPenaltyForm(null);
}

/* ---- slide-over ---- */
function openPanel(html) {
  const panel = $("#panel"), overlay = $("#overlay");
  panel.innerHTML = html;
  panel.hidden = false;
  overlay.hidden = false;
  requestAnimationFrame(() => { panel.classList.add("open"); overlay.classList.add("open"); });
  overlay.onclick = closePanel;
  const x = panel.querySelector(".x");
  if (x) x.onclick = closePanel;
  const body = panel.querySelector(".pb");
  if (body) body.scrollTop = 0;
}
function closePanel() {
  const panel = $("#panel"), overlay = $("#overlay");
  panel.classList.remove("open");
  overlay.classList.remove("open");
  setTimeout(() => { panel.hidden = true; overlay.hidden = true; panel.innerHTML = ""; }, 220);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

const field = (k, v, big) => `<div class="field"><div class="k">${k}</div><div class="v ${big ? "big" : ""}">${v}</div></div>`;

function openContract(id) {
  const c = STATE.contracts.find((x) => x.id === id);
  if (!c) return;
  const s = expiryClass(c._days, c.indefinite_end);
  const linked = penaltiesForContract(c);
  const exts = extensionsForContract(c);
  const events = (c.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const people = (c.people || []).map((pe) =>
    `<div class="person"><div class="av">${esc(initials(pe.name).toUpperCase())}</div><div><div>${esc(pe.name)}</div><div class="rl">${esc(pe.role || "—")}</div></div></div>`
  ).join("") || `<div class="empty">Não informado.</div>`;
  const termBadge = c.indefinite_end
    ? `<span class="badge b-neutral">Vigência indeterminada</span>`
    : `<span class="badge ${s.cls}"><span class="d" style="background:var(${s.ink})"></span>${s.label} · ${c._days} dias</span>`;
  openPanel(`
    <div class="ph">
      <div style="min-width:0">
        <div class="sub"><span class="chip">${esc(clean(c.category) || "—")}</span><span class="mono">Contrato ${esc(c.number)}</span></div>
        <h2 style="margin-top:8px">${esc(c.company)}</h2>
        <div class="sub">${termBadge}${c.has_penalty ? `<span class="badge b-crit"><span class="d" style="background:var(--crit-ink)"></span>Possui penalidade</span>` : ""}<span class="badge b-accent">${esc(c.status || "ATIVO")}</span></div>
      </div>
      <button class="iconbtn x" aria-label="Fechar">${ICONS.x}</button>
    </div>
    <div class="pb">
      ${c.dirty ? `<div class="note" style="margin-bottom:18px">${ICONS.info}<div>Registro com preenchimento inconsistente na planilha original (colunas deslocadas). Um sistema com validação bloquearia esse erro na entrada.</div></div>` : ""}
      <div class="section"><h4>Objeto</h4><div style="font-size:13.5px">${esc(clean(c.object) || "—")}</div></div>
      <div class="section"><h4>Valores</h4><div class="dl">
        ${field("Valor mensal", c.monthly_value != null ? brl.format(c.monthly_value) : "—")}
        ${field("Valor inicial", c.initial_value != null ? brl.format(c.initial_value) : "—")}
        ${field("Valor atual", c.current_value != null ? brl.format(c.current_value) : "—", true)}
        ${field("Lei da contratação", esc(c.law || "—"))}
      </div></div>
      <div class="section"><h4>Vigência</h4><div class="dl">
        ${field("Início", fmtDate(c.start_date))}
        ${field("Fim", c.indefinite_end ? "Indeterminado" : fmtDate(c.end_date))}
        ${field("Prazo inicial", esc(c.initial_term || "—"))}
        ${field("Já prorrogado", c.extended ? "Sim" : "Não")}
        ${field("Pode prorrogar", c.extendable === true ? "Sim" : c.extendable === false ? "Não" : "—")}
        ${field("Nº do processo", `<span class="mono">${esc(c.process || "—")}</span>`)}
      </div></div>
      <div class="section"><h4>Prorrogações ${exts.length ? `(${exts.length})` : ""}</h4>
        ${exts.length ? `<div class="exlist">${exts.map((e) => {
          const d = daysUntil(e.end_date);
          const es = expiryClass(d, false);
          return `<div class="exrow"><div class="bar" style="background:var(${es.ink})"></div><div class="exwho"><b>${fmtDate(e.start_date)} – ${fmtDate(e.end_date)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ""}</div><span class="badge ${es.cls}"><span class="d" style="background:var(${es.ink})"></span>${d == null ? "—" : d < 0 ? "Encerrada" : d + " d"}</span></div>`;
        }).join("")}</div>` : `<div class="empty">Nenhuma prorrogação registrada. Use "Editar" para adicionar.</div>`}
      </div>
      <div class="section"><h4>Eventos ${events.length ? `(${events.length})` : ""}</h4>
        ${events.length ? `<div class="evlist">${events.map((e) =>
          `<div class="evrow"><div class="evdate mono">${fmtDate(e.date)}</div><div class="evtext">${esc(e.text || "—")}</div></div>`
        ).join("")}</div>` : `<div class="empty">Nenhum evento registrado. Use "Editar" para adicionar.</div>`}
      </div>
      <div class="section"><h4>Gestão e fiscalização</h4><div class="people">${people}</div></div>
      ${c.progress ? `<div class="section"><h4>Andamento do processo</h4><div class="andamento">${esc(c.progress)}</div></div>` : ""}
      ${c.has_amendment && c.amendment_text ? `<div class="section"><h4>Termos aditivos (${c.amendment_count})</h4><div class="terms">${esc(c.amendment_text)}</div></div>` : ""}
      ${c.has_apostille && c.apostille_text ? `<div class="section"><h4>Termos de apostilamento (${c.apostille_count})</h4><div class="terms">${esc(c.apostille_text)}</div></div>` : ""}
      <div class="section"><h4>Penalidades vinculadas ${linked.length ? `(${linked.length})` : ""}</h4>
        ${linked.length ? linked.map((p) => `<div class="penrow" data-p="${p.id}" style="cursor:pointer"><div class="top"><div class="inf">${esc(p.infraction_type || "—")}</div><span class="badge ${isOpen(p) ? "b-warn" : "b-good"}">${isOpen(p) ? "Em andamento" : "Finalizado"}</span></div><div class="dt mono">${esc(p.process)} · ${fmtDate(p.infraction_date)}</div></div>`).join("") : `<div class="empty">Nenhuma penalidade registrada para este contrato.</div>`}
      </div>
    </div>
    <div class="panel-actions" id="pactions">
      <button class="btn ghost danger" id="delContract">${ICONS.trash}Excluir</button>
      <button class="btn ghost" id="editContract">${ICONS.edit}Editar</button>
    </div>`);
  $("#panel").querySelectorAll(".penrow[data-p]").forEach((r) => (r.onclick = () => openPenalty(+r.dataset.p)));
  $("#editContract").onclick = () => openContractForm(c);
  $("#delContract").onclick = () => confirmDelete("contracts", c.id, `o contrato ${c.number}`);
}

function openPenalty(id) {
  const p = STATE.penalties.find((x) => x.id === id);
  if (!p) return;
  const open = isOpen(p);
  openPanel(`
    <div class="ph">
      <div style="min-width:0">
        <div class="sub"><span class="chip">${esc(p.service_type || "—")}</span><span class="mono">Contrato ${esc(p.contract)}</span></div>
        <h2 style="margin-top:8px">${esc(p.company)}</h2>
        <div class="sub"><span class="badge ${open ? "b-warn" : "b-good"}"><span class="d" style="background:var(${open ? "--warn-ink" : "--good-ink"})"></span>${open ? "Em andamento" : "Finalizado"}</span><span class="badge b-neutral">${esc(p.infraction_type || "—")}</span></div>
      </div>
      <button class="iconbtn x" aria-label="Fechar">${ICONS.x}</button>
    </div>
    <div class="pb">
      <div class="section"><h4>Infração</h4><div style="font-size:13.5px;line-height:1.6">${esc(p.infraction || "—")}</div></div>
      <div class="section"><h4>Dados do processo</h4><div class="dl">
        ${field("Nº do processo", `<span class="mono">${esc(p.process || "—")}</span>`)}
        ${field("Data da infração", fmtDate(p.infraction_date))}
        ${field("Vigência do contrato", `${fmtDate(p.contract_start)} – ${fmtDate(p.contract_end)}`)}
        ${field("Data de conclusão", p.conclusion_date && !open ? fmtDate(p.conclusion_date) : "—")}
      </div></div>
      <div class="section"><h4>Andamento</h4><div class="andamento">${esc(p.progress || "—")}</div></div>
      <div class="section"><h4>Próximo passo</h4><div class="andamento" style="border-left-color:var(--warn-ink)">${esc(p.next_step || "—")}</div></div>
      <div class="section"><h4>Status atual</h4><div style="font-size:13px;color:var(--muted)">${esc(p.status || "—")}</div></div>
    </div>
    <div class="panel-actions">
      <button class="btn ghost danger" id="delPenalty">${ICONS.trash}Excluir</button>
      <button class="btn ghost" id="editPenalty">${ICONS.edit}Editar</button>
    </div>`);
  $("#editPenalty").onclick = () => openPenaltyForm(p);
  $("#delPenalty").onclick = () => confirmDelete("penalties", p.id, `esta penalidade`);
}

/* ---- delete (confirmação em dois passos) ---- */
function confirmDelete(kind, id, label) {
  const bar = $(".panel-actions");
  if (!bar) return;
  bar.innerHTML = `<span style="font-size:12.5px;color:var(--muted);align-self:center;margin-right:auto">Excluir ${esc(label)}?</span>
    <button class="btn ghost" id="cancelDel">Cancelar</button>
    <button class="btn danger-solid" id="confirmDel">Confirmar exclusão</button>`;
  $("#cancelDel").onclick = () => (kind === "contracts" ? openContract(id) : openPenalty(id));
  $("#confirmDel").onclick = async () => {
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      closePanel();
      await reload();
      toast(kind === "contracts" ? "Contrato excluído (em memória)." : "Penalidade excluída (em memória).");
    } catch (e) { toast("Falha ao excluir: " + e.message); }
  };
}

/* Grava as prorrogações do formulário na API: cria as novas, atualiza as
 * existentes e exclui as que foram removidas das linhas. */
async function syncExtensions(box, original, contractId, contractNumber) {
  const rows = [...box.querySelectorAll(".ex-row")]
    .map((r) => ({
      id: r.dataset.id ? +r.dataset.id : null,
      start_date: r.querySelector(".ex-start").value,
      end_date: r.querySelector(".ex-end").value,
      note: r.querySelector(".ex-note").value.trim(),
    }))
    .filter((e) => e.start_date || e.end_date || e.note);

  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const ops = [];
  original.forEach((o) => {
    if (!keptIds.has(o.id)) ops.push(api(`/extensions/${o.id}`, { method: "DELETE" }));
  });
  rows.forEach((r) => {
    const payload = {
      contract_id: contractId, contract_number: contractNumber,
      start_date: r.start_date, end_date: r.end_date, note: r.note,
    };
    if (r.id) ops.push(api(`/extensions/${r.id}`, { method: "PATCH", body: JSON.stringify(payload) }));
    else ops.push(api("/extensions", { method: "POST", body: JSON.stringify(payload) }));
  });
  await Promise.all(ops);
}

/* ---- contract form (create + edit) ---- */
function openContractForm(existing) {
  const editing = !!existing;
  const c = existing || {};
  const categories = [...new Set(STATE.contracts.map((x) => clean(x.category)).filter(Boolean))].sort();
  const owners = [...new Set(STATE.contracts.map((x) => x.owner).filter(Boolean)), "Mariany", "Rafael", "Renan"];
  const ownerOpts = [...new Set(owners)].map((o) => `<option ${c.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("");
  const catOpts = categories.map((t) => `<option ${clean(c.category) === t ? "selected" : ""}>${esc(t)}</option>`).join("");
  openPanel(`
    <div class="ph"><div><h2>${editing ? "Editar contrato" : "Novo contrato"}</h2><div class="sub">${editing ? "Contrato " + esc(c.number) : "Cadastro com campos padronizados"}</div></div><button class="iconbtn x" aria-label="Fechar">${ICONS.x}</button></div>
    <div class="pb">
      <form id="contractForm" class="form">
        <div class="fg wide"><label for="f_company">Empresa contratada *</label><input id="f_company" required value="${esc(c.company || "")}" placeholder="Razão social"></div>
        <div class="fg"><label for="f_number">Nº do contrato *</label><input id="f_number" required value="${esc(c.number || "")}" placeholder="00/2026"></div>
        <div class="fg"><label for="f_process">Nº do processo</label><input id="f_process" value="${esc(c.process || "")}" placeholder="59800.000000/2026-00"></div>
        <div class="fg"><label for="f_category">Tipo</label><input id="f_category" list="catList" value="${esc(clean(c.category) || "")}" placeholder="Ex.: TI"><datalist id="catList">${catOpts}</datalist></div>
        <div class="fg"><label for="f_owner">Responsável</label><select id="f_owner">${ownerOpts}</select></div>
        <div class="fg wide"><label for="f_object">Objeto</label><textarea id="f_object" rows="2" placeholder="Descrição do objeto do contrato">${esc(clean(c.object) || "")}</textarea></div>
        <div class="fg"><label for="f_monthly">Valor mensal (R$)</label><input id="f_monthly" type="number" step="0.01" value="${c.monthly_value ?? ""}" placeholder="0,00"></div>
        <div class="fg"><label for="f_current">Valor atual (R$)</label><input id="f_current" type="number" step="0.01" value="${c.current_value ?? ""}" placeholder="0,00"></div>
        <div class="fg"><label for="f_start">Início da vigência</label><input id="f_start" type="date" value="${esc(c.start_date || "")}"></div>
        <div class="fg"><label for="f_end">Fim da vigência</label><input id="f_end" type="date" value="${esc(c.end_date || "")}"></div>
        <div class="fg wide hint">O prazo até o vencimento e os alertas são calculados automaticamente a partir das datas.</div>
        <div class="fg wide">
          <label>Gestão e fiscalização</label>
          <div id="peopleRows" class="people-editor"></div>
          <button type="button" class="btn ghost sm" id="addPerson">${ICONS.plus}Adicionar pessoa</button>
        </div>
        <div class="fg wide">
          <label>Prorrogações</label>
          <div class="hint" style="margin:-2px 0 2px">Cada prorrogação tem data inicial e final. São gravadas na API de prorrogações ao salvar.</div>
          <div id="extRows" class="ext-editor"></div>
          <button type="button" class="btn ghost sm" id="addExt">${ICONS.plus}Adicionar prorrogação</button>
        </div>
        <div class="fg wide">
          <label>Eventos</label>
          <div class="hint" style="margin:-2px 0 2px">Registros com data e descrição livre (ocorrências, reuniões, notificações).</div>
          <div id="eventRows" class="event-editor"></div>
          <button type="button" class="btn ghost sm" id="addEvent">${ICONS.plus}Adicionar evento</button>
        </div>
        <div class="fg wide form-actions">
          <button type="button" class="btn ghost" id="cancelForm">Cancelar</button>
          <button type="submit" class="btn primary">${editing ? "Salvar alterações" : "Criar contrato"}</button>
        </div>
      </form>
    </div>`);
  // editor de pessoas (gestão e fiscalização)
  const rowsBox = $("#peopleRows");
  rowsBox.innerHTML = (c.people && c.people.length ? c.people : [null]).map(peopleRowHTML).join("");
  $("#addPerson").onclick = () => rowsBox.insertAdjacentHTML("beforeend", peopleRowHTML(null));
  rowsBox.addEventListener("click", (e) => {
    const del = e.target.closest(".pe-del");
    if (del) { e.preventDefault(); del.closest(".pe-row").remove(); }
  });

  // editor de prorrogações (data inicial / data final)
  const extBox = $("#extRows");
  const existingExts = editing ? extensionsForContract(c) : [];
  extBox.innerHTML = existingExts.map(extensionRowHTML).join("");
  $("#addExt").onclick = () => extBox.insertAdjacentHTML("beforeend", extensionRowHTML(null));
  extBox.addEventListener("click", (e) => {
    const del = e.target.closest(".pe-del");
    if (del) { e.preventDefault(); del.closest(".ex-row").remove(); }
  });

  // editor de eventos (data + texto livre)
  const evBox = $("#eventRows");
  evBox.innerHTML = (c.events && c.events.length ? c.events : []).map(eventRowHTML).join("");
  $("#addEvent").onclick = () => evBox.insertAdjacentHTML("beforeend", eventRowHTML(null));
  evBox.addEventListener("click", (e) => {
    const del = e.target.closest(".pe-del");
    if (del) { e.preventDefault(); del.closest(".ev-row").remove(); }
  });

  $("#cancelForm").onclick = () => (editing ? openContract(c.id) : closePanel());
  $("#contractForm").onsubmit = async (e) => {
    e.preventDefault();
    const g = (id) => $("#" + id).value.trim();
    const people = [...rowsBox.querySelectorAll(".pe-row")]
      .map((r) => ({ name: r.querySelector(".pe-name").value.trim(), role: r.querySelector(".pe-role").value }))
      .filter((p) => p.name);
    const events = [...evBox.querySelectorAll(".ev-row")]
      .map((r) => ({ date: r.querySelector(".ev-date").value, text: r.querySelector(".ev-text").value.trim() }))
      .filter((ev) => ev.date || ev.text);
    const body = {
      company: g("f_company"), number: g("f_number"), process: g("f_process"),
      category: g("f_category"), object: g("f_object"), owner: g("f_owner"),
      monthly_value: g("f_monthly") === "" ? null : parseFloat(g("f_monthly")),
      current_value: g("f_current") === "" ? null : parseFloat(g("f_current")),
      initial_value: g("f_current") === "" ? null : parseFloat(g("f_current")),
      start_date: g("f_start"), end_date: g("f_end"), indefinite_end: !g("f_end"),
      people, events,
    };
    try {
      let saved;
      if (editing) {
        saved = await api(`/contracts/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        saved = await api("/contracts", { method: "POST", body: JSON.stringify(body) });
      }
      await syncExtensions(extBox, existingExts, saved.id, saved.number);
      closePanel();
      if (editing) {
        await reload(saved.id);
        toast("Contrato atualizado (em memória).");
      } else {
        view = "contracts";
        await reload();
        openContract(saved.id);
        toast("Contrato criado (em memória). Reinicie a API para voltar ao original.");
      }
    } catch (err) { toast("Falha ao salvar: " + err.message); }
  };
}

/* ---- penalty form (create + edit) ---- */
function openPenaltyForm(existing) {
  const editing = !!existing;
  const p = existing || {};
  const types = [...new Set(STATE.penalties.map((x) => x.infraction_type).filter(Boolean))].sort();
  const statuses = ["Em andamento", "Finalizado", ...new Set(STATE.penalties.map((x) => x.status).filter(Boolean))];
  openPanel(`
    <div class="ph"><div><h2>${editing ? "Editar penalidade" : "Nova penalidade"}</h2><div class="sub">${editing ? esc(p.company) : "Registro de processo de penalidade"}</div></div><button class="iconbtn x" aria-label="Fechar">${ICONS.x}</button></div>
    <div class="pb">
      <form id="penaltyForm" class="form">
        <div class="fg wide"><label for="p_company">Empresa *</label><input id="p_company" required value="${esc(p.company || "")}" placeholder="Razão social"></div>
        <div class="fg"><label for="p_contract">Contrato</label><input id="p_contract" value="${esc(p.contract || "")}" placeholder="00/2026"></div>
        <div class="fg"><label for="p_process">Nº do processo</label><input id="p_process" value="${esc(p.process || "")}" placeholder="59800.000000/2026-00"></div>
        <div class="fg"><label for="p_type">Tipo de infração</label><input id="p_type" list="typeList" value="${esc(p.infraction_type || "")}" placeholder="Ex.: Atraso de salário"><datalist id="typeList">${types.map((t) => `<option>${esc(t)}</option>`).join("")}</datalist></div>
        <div class="fg"><label for="p_date">Data da infração</label><input id="p_date" type="date" value="${esc(p.infraction_date || "")}"></div>
        <div class="fg wide"><label for="p_infraction">Descrição da infração</label><textarea id="p_infraction" rows="3" placeholder="Descreva a infração">${esc(p.infraction || "")}</textarea></div>
        <div class="fg wide"><label for="p_next">Próximo passo</label><input id="p_next" value="${esc(p.next_step || "")}" placeholder="Ação seguinte"></div>
        <div class="fg wide"><label for="p_status">Status</label><input id="p_status" list="statusList" value="${esc(p.status || "Em andamento")}"><datalist id="statusList">${[...new Set(statuses)].map((s) => `<option>${esc(s)}</option>`).join("")}</datalist></div>
        <div class="fg wide form-actions">
          <button type="button" class="btn ghost" id="cancelPForm">Cancelar</button>
          <button type="submit" class="btn primary">${editing ? "Salvar alterações" : "Criar penalidade"}</button>
        </div>
      </form>
    </div>`);
  $("#cancelPForm").onclick = () => (editing ? openPenalty(p.id) : closePanel());
  $("#penaltyForm").onsubmit = async (e) => {
    e.preventDefault();
    const g = (id) => $("#" + id).value.trim();
    const body = {
      company: g("p_company"), contract: g("p_contract"), process: g("p_process"),
      infraction_type: g("p_type"), infraction_date: g("p_date"), infraction: g("p_infraction"),
      next_step: g("p_next"), status: g("p_status"),
    };
    try {
      if (editing) {
        const saved = await api(`/penalties/${p.id}`, { method: "PATCH", body: JSON.stringify(body) });
        closePanel();
        await reload();
        openPenalty(saved.id);
        toast("Penalidade atualizada (em memória).");
      } else {
        const saved = await api("/penalties", { method: "POST", body: JSON.stringify(body) });
        closePanel();
        view = "penalties";
        await reload();
        openPenalty(saved.id);
        toast("Penalidade criada (em memória).");
      }
    } catch (err) { toast("Falha ao salvar: " + err.message); }
  };
}

/* ---- toast ---- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
}

/* ---- theme ---- */
function isDark() {
  const a = document.documentElement.getAttribute("data-theme");
  return a ? a === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
}
function setThemeIcon() { $("#theme").innerHTML = isDark() ? ICONS.sun : ICONS.moon; }
$("#theme").onclick = () => { document.documentElement.setAttribute("data-theme", isDark() ? "light" : "dark"); setThemeIcon(); };
setThemeIcon();

/* ---- boot ---- */
function showFatal(err) {
  $("#content").innerHTML = `<div class="note" style="border-color:var(--crit-ink)">${ICONS.alert}<div><b>Não foi possível carregar os dados.</b><br>O site precisa ser servido por HTTP (um servidor estático ou o GitHub Pages) — abrir o <code>index.html</code> direto pelo arquivo não funciona, pois o navegador bloqueia a leitura de <code>data/seed.json</code>.<br><br>Detalhe: ${esc(err.message)}</div></div>`;
}
(async function boot() {
  try {
    const seedUrl = new URL("data/seed.json", document.baseURI).href;
    STORE = await window.SudecoStaticStore.create(seedUrl);
    await loadAll();
    render();
  } catch (err) {
    renderNav();
    $("#viewtitle").textContent = "Painel";
    showFatal(err);
  }
})();
