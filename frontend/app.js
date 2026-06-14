(() => {
  "use strict";

  const SAVE_KEY = "ifm.save.v1";
  const TICK_MS = 1000;
  const AUTOSAVE_MS = 15000;
  const MIN_ZOOM_FOR_VISIBLE = 3;

  const PLANE_TYPES = [
    { tier: 1, code: "C172", name: "Cessna 172",  cost: 1000,      baseRate: 0.5,  range: 1500,   blurb: "Tiny prop. Short hops." },
    { tier: 2, code: "B737", name: "Boeing 737",  cost: 25000,     baseRate: 5,    range: 6000,   blurb: "Regional workhorse." },
    { tier: 3, code: "B777", name: "Boeing 777",  cost: 250000,    baseRate: 30,   range: 15000,  blurb: "Long-haul widebody." },
    { tier: 4, code: "A380", name: "Airbus A380", cost: 2000000,   baseRate: 100,  range: 20000,  blurb: "Jumbo. Anywhere." },
  ];

  const UNLOCK_MEDIUM_AT = 50000;
  const STARTING_CASH = 10000;

  const PRINCIPAL_AIRPORTS = new Set([
    "JFK","LAX","ORD","ATL","DFW","DEN","SFO","SEA","MIA","BOS","IAD","EWR",
    "LAS","MCO","MSP","DTW","PHX","IAH","YYZ","YVR","MEX",
    "LHR","LGW","CDG","ORY","FRA","AMS","MAD","BCN","FCO","MUC","IST",
    "SVO","DME","ZRH","VIE","DUB","CPH","ARN","OSL","HEL","ATH","MAN","TXL",
    "PEK","PKX","PVG","SHA","HKG","HND","NRT","ICN","GMP","TPE","SIN","KUL",
    "BKK","DMK","DEL","BOM","BLR","MAA","CCU","DOH","DXB","AUH","SHJ","KIX",
    "NGO","CTS","JED","RUH","GRU","EZE","BOG","LIM","SCL","GIG","CCS","MDE",
    "JNB","CPT","CAI","ADD","CMN","LOS","NBO","KGL","TUN","ALG","SYD","MEL",
    "AKL","BNE","PER","CHC","WLG","ADL","KTM","TAS","ALA","TBS","EVN","MSQ",
    "KIV","PRG","BUD","WAW","OTP","SOF","BEG","ZAG","LJU","BTS","BRU","LUX",
    "LIS","OPO","KEF","RIX","VNO","TLL","GVA","BSL","NCE","LYS","NAP","PMO",
    "AGP","VLC","FLR","VCE","BLQ","ANC","YUL","YOW","YHZ","YYC","YEG","YWG",
    "NAS","SJU","PTY","SJO","SAL","GUA","TIJ","MTY","GDL","CUN","UIO","GYE",
    "ASU","BSB","CNF","POA","REC","FOR","AEP","COR","MDZ","ROS","BRC","MDQ",
    "YVR","PPT","NOU","SUV","APW","HIR","NAN","SUV",
  ]);

  const state = {
    cash: STARTING_CASH,
    totalEarned: 0,
    fleet: { 1: 0, 2: 0, 3: 0, 4: 0 },
    routes: [],
    nextRouteId: 1,
    mediumAirportsUnlocked: false,
    lastSaved: Date.now(),
    startedAt: Date.now(),
  };

  let airports = [];
  const airportById = new Map();
  let map = null;
  const markerById = new Map();
  const polylineByRouteId = new Map();
  let selectedAirportId = null;
  let panelMode = "welcome";

  const $ = (id) => document.getElementById(id);

  const fmtMoney = (n) => {
    if (!isFinite(n)) return "$∞";
    if (Math.abs(n) >= 1e9) return "$" + (n/1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n/1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e4) return "$" + Math.round(n).toLocaleString();
    return "$" + n.toFixed(n % 1 === 0 ? 0 : 2);
  };

  const fmtNum = (n) => Math.round(n).toLocaleString();

  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function bearing(a, b) {
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const dLon = toRad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function greatCirclePath(a, b, segments = 64) {
    const lat1 = toRad(a.lat), lon1 = toRad(a.lon);
    const lat2 = toRad(b.lat), lon2 = toRad(b.lon);
    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((lat2-lat1)/2)**2 +
      Math.cos(lat1)*Math.cos(lat2)*Math.sin((lon2-lon1)/2)**2
    ));
    if (d === 0) return [[a.lat, a.lon]];
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const f = i / segments;
      const A = Math.sin((1-f)*d) / Math.sin(d);
      const B = Math.sin(f*d) / Math.sin(d);
      const x = A*Math.cos(lat1)*Math.cos(lon1) + B*Math.cos(lat2)*Math.cos(lon2);
      const y = A*Math.cos(lat1)*Math.sin(lon1) + B*Math.cos(lat2)*Math.sin(lon2);
      const z = A*Math.sin(lat1) + B*Math.sin(lat2);
      points.push([toDeg(Math.atan2(z, Math.sqrt(x*x+y*y))), toDeg(Math.atan2(y, x))]);
    }
    return points;
  }

  function planeByTier(tier) {
    return PLANE_TYPES.find(p => p.tier === tier);
  }

  function routeIncome(route) {
    const a = airportById.get(route.from);
    const b = airportById.get(route.to);
    if (!a || !b) return 0;
    const km = haversineKm(a, b);
    const plane = planeByTier(route.tier);
    if (!plane) return 0;
    if (km > plane.range) return 0;
    const distFactor = Math.max(0.2, km / 1000);
    return plane.baseRate * distFactor;
  }

  function totalIncomePerSec() {
    let sum = 0;
    for (const r of state.routes) sum += routeIncome(r);
    return sum;
  }

  function fleetSize() {
    return state.fleet[1] + state.fleet[2] + state.fleet[3] + state.fleet[4];
  }

  function isAirportUnlocked(ap) {
    if (ap.type === "large_airport") return true;
    if (ap.type === "medium_airport") return state.mediumAirportsUnlocked;
    return false;
  }

  function save() {
    state.lastSaved = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* quota / private mode */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(state, data);
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyOfflineProgress() {
    const now = Date.now();
    const elapsedSec = (now - state.lastSaved) / 1000;
    if (elapsedSec < 30) return;
    const income = totalIncomePerSec();
    if (income <= 0) {
      toast(`Welcome back. Your airline earned nothing while you were away.`, "warn");
      return;
    }
    const offlineCap = Math.min(elapsedSec, 8 * 3600);
    const earned = income * offlineCap;
    state.cash += earned;
    state.totalEarned += earned;
    const hrs = (offlineCap / 3600).toFixed(1);
    toast(`Welcome back! You earned ${fmtMoney(earned)} over ${hrs}h offline.`, "good");
  }

  function buyPlane(tier) {
    const plane = planeByTier(tier);
    if (!plane) return;
    if (state.cash < plane.cost) {
      toast("Not enough cash to buy a " + plane.name, "bad");
      return;
    }
    state.cash -= plane.cost;
    state.fleet[tier] += 1;
    toast(`Purchased ${plane.name} for ${fmtMoney(plane.cost)}`, "good");
    save();
    renderAll();
  }

  function sellPlane(tier) {
    if (state.fleet[tier] <= 0) return;
    const plane = planeByTier(tier);
    const refund = Math.floor(plane.cost * 0.5);
    state.fleet[tier] -= 1;
    state.cash += refund;
    toast(`Sold a ${plane.name} for ${fmtMoney(refund)}`, "warn");
    save();
    renderAll();
  }

  function createRoute(fromId, toId, tier) {
    const from = airportById.get(fromId);
    const to = airportById.get(toId);
    if (!from || !to) { toast("Unknown airport", "bad"); return false; }
    if (fromId === toId) { toast("Origin and destination must differ", "bad"); return false; }
    if (state.fleet[tier] <= 0) { toast("You don't own a plane of that tier", "bad"); return false; }
    const km = haversineKm(from, to);
    const plane = planeByTier(tier);
    if (km > plane.range) {
      toast(`${plane.name} can't fly ${fmtNum(km)} km (range ${fmtNum(plane.range)} km)`, "bad");
      return false;
    }
    if (state.routes.some(r => r.from === fromId && r.to === toId)) {
      toast("A route already exists between these airports", "warn");
      return false;
    }
    state.fleet[tier] -= 1;
    const route = {
      id: state.nextRouteId++,
      from: fromId,
      to: toId,
      tier,
      createdAt: Date.now(),
    };
    state.routes.push(route);
    const income = routeIncome(route);
    toast(`Route ${fromId} → ${toId} opened (+${fmtMoney(income)}/s)`, "good");
    save();
    drawRoute(route);
    renderAll();
    return true;
  }

  function deleteRoute(routeId) {
    const idx = state.routes.findIndex(r => r.id === routeId);
    if (idx < 0) return;
    const r = state.routes[idx];
    state.routes.splice(idx, 1);
    state.fleet[r.tier] += 1;
    removeRoutePolyline(routeId);
    toast(`Route closed, ${planeByTier(r.tier).name} returned to hangar`, "warn");
    save();
    renderAll();
  }

  function tryUnlockMediumAirports() {
    if (state.mediumAirportsUnlocked) return;
    if (state.totalEarned >= UNLOCK_MEDIUM_AT) {
      state.mediumAirportsUnlocked = true;
      toast(`Regional airports unlocked!`, "good");
      save();
      updateVisibleMarkers();
      renderAll();
    }
  }

  function toast(msg, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    $("toasts").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 300ms"; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  function showPanel(mode, ctx) {
    panelMode = mode;
    selectedAirportId = ctx && ctx.airportId || null;
    const panel = $("side-panel");
    panel.classList.remove("collapsed");
    renderPanel();
  }

  function hidePanel() {
    panelMode = "welcome";
    selectedAirportId = null;
    $("side-panel").classList.add("collapsed");
  }

  function renderPanel() {
    const titleEl = $("panel-title");
    const bodyEl = $("panel-body");
    if (panelMode === "airport" && selectedAirportId) {
      const ap = airportById.get(selectedAirportId);
      if (ap) {
        titleEl.textContent = "Airport";
        bodyEl.innerHTML = renderAirportPanel(ap);
        bindAirportPanelEvents(ap);
        return;
      }
    }
    if (panelMode === "hangar") {
      titleEl.textContent = "Hangar";
      bodyEl.innerHTML = renderHangarPanel();
      bindHangarPanelEvents();
      return;
    }
    if (panelMode === "routes") {
      titleEl.textContent = "Routes";
      bodyEl.innerHTML = renderRoutesPanel();
      bindRoutesPanelEvents();
      return;
    }
    if (panelMode === "stats") {
      titleEl.textContent = "Stats";
      bodyEl.innerHTML = renderStatsPanel();
      return;
    }
    titleEl.textContent = "Welcome, CEO";
    bodyEl.innerHTML = renderWelcomePanel();
  }

  function renderWelcomePanel() {
    return `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:13px; line-height:1.6; margin:0 0 10px;">
          You are the CEO of a brand-new airline.
          Click any yellow airport on the map to start a route.
        </p>
        <div class="airport-card">
          <div class="name">Quick start</div>
          <div class="meta">Open the Hangar and buy your first aircraft.</div>
        </div>
      </div>
      <div class="panel-section">
        <h3>Goal</h3>
        <div class="kv"><span class="k">Build a global network</span><span class="v">∞</span></div>
        <div class="kv"><span class="k">Unlock regional airports</span><span class="v">${state.mediumAirportsUnlocked ? "✓" : fmtMoney(UNLOCK_MEDIUM_AT)}</span></div>
        <div class="kv"><span class="k">Current cash</span><span class="v">${fmtMoney(state.cash)}</span></div>
        <div class="kv"><span class="k">Income / sec</span><span class="v">${fmtMoney(totalIncomePerSec())}</span></div>
      </div>
      <div class="panel-section">
        <button class="btn primary" style="width:100%;" data-action="open-hangar">Open Hangar</button>
      </div>
    `;
  }

  function renderAirportPanel(ap) {
    const routes = state.routes.filter(r => r.from === ap.id || r.to === ap.id);
    const unlocked = isAirportUnlocked(ap);
    const typeLabel = ap.type === "large_airport" ? "International" : "Regional";
    return `
      <div class="panel-section">
        <div class="airport-card">
          <div class="name">${ap.name || ap.id}<span class="code">${ap.id}</span></div>
          <div class="meta">${[ap.city, ap.country].filter(Boolean).join(", ")} · ${typeLabel}</div>
        </div>
      </div>
      <div class="panel-section">
        <h3>Location</h3>
        <div class="kv"><span class="k">Latitude</span><span class="v">${ap.lat.toFixed(3)}°</span></div>
        <div class="kv"><span class="k">Longitude</span><span class="v">${ap.lon.toFixed(3)}°</span></div>
      </div>
      <div class="panel-section">
        <h3>${unlocked ? "Routes" : "Locked"}</h3>
        ${unlocked ? renderRouteListForAirport(ap, routes) : `<div class="empty">Regional airports unlock at ${fmtMoney(UNLOCK_MEDIUM_AT)} total earned.</div>`}
      </div>
      <div class="panel-section">
        <button class="btn primary" style="width:100%;" data-action="create-route" ${unlocked ? "" : "disabled"}>Open new route</button>
      </div>
    `;
  }

  function renderRouteListForAirport(ap, routes) {
    if (routes.length === 0) return `<div class="empty">No routes yet. Open your first one.</div>`;
    return `<div class="route-list">` + routes.map(r => {
      const other = r.from === ap.id ? r.to : r.from;
      const otherAp = airportById.get(other);
      const direction = r.from === ap.id ? "→" : "←";
      const income = routeIncome(r);
      return `
        <div class="route-item">
          <div class="route-codes">${ap.id} <span class="arrow">${direction}</span> ${other}</div>
          <div class="route-meta">
            <span class="plane-pill tier-${r.tier}">${planeByTier(r.tier).code}</span>
            <span class="route-income">${income > 0 ? fmtMoney(income) + "/s" : "out of range"}</span>
          </div>
          <div class="route-meta">
            <span>${otherAp ? (otherAp.city || otherAp.name) : ""}</span>
            <button class="btn danger" data-action="close-route" data-route-id="${r.id}" style="padding:3px 8px; font-size:10px;">Close</button>
          </div>
        </div>
      `;
    }).join("") + `</div>`;
  }

  function renderHangarPanel() {
    const fleetTotal = fleetSize();
    return `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:12px; margin:0 0 8px;">
          You own <strong style="color:var(--text)">${fleetTotal}</strong> aircraft.
          Assign one to a route to start earning.
        </p>
      </div>
      <div class="panel-section">
        <h3>Buy aircraft</h3>
        <div class="plane-grid">
          ${PLANE_TYPES.map(p => `
            <div class="plane-card tier-${p.tier}">
              <div class="plane-name">${p.name}</div>
              <div class="plane-meta">${p.blurb}</div>
              <div class="plane-cost">${fmtMoney(p.cost)}</div>
              <div class="kv"><span class="k">Range</span><span class="v">${fmtNum(p.range)} km</span></div>
              <div class="kv"><span class="k">Rate / 1000km</span><span class="v">${fmtMoney(p.baseRate)}/s</span></div>
              <div class="kv"><span class="k">Owned</span><span class="v">${state.fleet[p.tier]}</span></div>
              <button class="btn primary" style="width:100%; margin-top:8px;" data-action="buy-plane" data-tier="${p.tier}" ${state.cash >= p.cost ? "" : "disabled"}>Buy</button>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="panel-section">
        <h3>Sell aircraft (50% refund)</h3>
        <div class="plane-grid">
          ${PLANE_TYPES.map(p => `
            <div class="plane-card tier-${p.tier}">
              <div class="plane-name">${p.name}</div>
              <div class="plane-meta">Owned: ${state.fleet[p.tier]}</div>
              <button class="btn" style="width:100%; margin-top:8px;" data-action="sell-plane" data-tier="${p.tier}" ${state.fleet[p.tier] > 0 ? "" : "disabled"}>Sell 1</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderRoutesPanel() {
    if (state.routes.length === 0) {
      return `
        <div class="panel-section">
          <div class="empty">No routes yet. Click an airport to start.</div>
        </div>
      `;
    }
    return `
      <div class="panel-section">
        <div class="route-list">
          ${state.routes.map(r => {
            const a = airportById.get(r.from);
            const b = airportById.get(r.to);
            const income = routeIncome(r);
            return `
              <div class="route-item">
                <div class="route-codes">${r.from} <span class="arrow">→</span> ${r.to}</div>
                <div class="route-meta">
                  <span class="plane-pill tier-${r.tier}">${planeByTier(r.tier).code}</span>
                  <span class="route-income">${income > 0 ? fmtMoney(income) + "/s" : "out of range"}</span>
                </div>
                <div class="route-meta">
                  <span>${a ? a.city : ""} → ${b ? b.city : ""}</span>
                  <button class="btn danger" data-action="close-route" data-route-id="${r.id}" style="padding:3px 8px; font-size:10px;">Close</button>
                </div>
                <div class="route-meta" style="font-size:10px; color:var(--text-faint);">
                  <span>${a && b ? fmtNum(haversineKm(a, b)) + " km" : ""}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderStatsPanel() {
    const totalRoutes = state.routes.length;
    const income = totalIncomePerSec();
    const uptimeH = ((Date.now() - state.startedAt) / 3600000).toFixed(1);
    return `
      <div class="panel-section">
        <div class="kv"><span class="k">Cash on hand</span><span class="v">${fmtMoney(state.cash)}</span></div>
        <div class="kv"><span class="k">Total earned</span><span class="v">${fmtMoney(state.totalEarned)}</span></div>
        <div class="kv"><span class="k">Income / sec</span><span class="v">${fmtMoney(income)}</span></div>
        <div class="kv"><span class="k">Income / min</span><span class="v">${fmtMoney(income * 60)}</span></div>
        <div class="kv"><span class="k">Income / hr</span><span class="v">${fmtMoney(income * 3600)}</span></div>
      </div>
      <div class="panel-section">
        <h3>Fleet</h3>
        ${PLANE_TYPES.map(p => `
          <div class="kv"><span class="k">${p.name}</span><span class="v">${state.fleet[p.tier]}</span></div>
        `).join("")}
      </div>
      <div class="panel-section">
        <h3>Network</h3>
        <div class="kv"><span class="k">Active routes</span><span class="v">${totalRoutes}</span></div>
        <div class="kv"><span class="k">Airports unlocked</span><span class="v">${airports.filter(isAirportUnlocked).length} / ${airports.length}</span></div>
        <div class="kv"><span class="k">Uptime</span><span class="v">${uptimeH} h</span></div>
      </div>
      <div class="panel-section">
        <h3>Milestones</h3>
        <div class="kv"><span class="k">First aircraft</span><span class="v">${fleetSize() > 0 ? "✓" : "—"}</span></div>
        <div class="kv"><span class="k">First route</span><span class="v">${totalRoutes > 0 ? "✓" : "—"}</span></div>
        <div class="kv"><span class="k">Regional unlocked</span><span class="v">${state.mediumAirportsUnlocked ? "✓" : "—"}</span></div>
        <div class="kv"><span class="k">$100K earned</span><span class="v">${state.totalEarned >= 1e5 ? "✓" : "—"}</span></div>
        <div class="kv"><span class="k">$1M earned</span><span class="v">${state.totalEarned >= 1e6 ? "✓" : "—"}</span></div>
      </div>
      <div class="panel-section">
        <button class="btn danger" style="width:100%;" data-action="reset-save">Reset save (start over)</button>
      </div>
    `;
  }

  function bindAirportPanelEvents(ap) {
    const body = $("panel-body");
    body.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => {
        const action = el.getAttribute("data-action");
        if (action === "create-route") openCreateRouteModal(ap);
        if (action === "close-route") {
          const rid = parseInt(el.getAttribute("data-route-id"), 10);
          deleteRoute(rid);
        }
      });
    });
  }

  function bindHangarPanelEvents() {
    const body = $("panel-body");
    body.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => {
        const action = el.getAttribute("data-action");
        const tier = parseInt(el.getAttribute("data-tier"), 10);
        if (action === "buy-plane") buyPlane(tier);
        if (action === "sell-plane") sellPlane(tier);
      });
    });
    body.querySelectorAll("[data-action='open-hangar']").forEach(el => {
      el.addEventListener("click", () => showPanel("hangar"));
    });
  }

  function bindRoutesPanelEvents() {
    const body = $("panel-body");
    body.querySelectorAll("[data-action='close-route']").forEach(el => {
      el.addEventListener("click", () => {
        const rid = parseInt(el.getAttribute("data-route-id"), 10);
        deleteRoute(rid);
      });
    });
  }

  function openCreateRouteModal(fromAp) {
    const modal = $("modal");
    const body = $("modal-body");
    const title = $("modal-title");
    title.textContent = `New route from ${fromAp.id}`;
    let pickedTo = null;
    let pickedTier = null;
    let searchTerm = "";

    body.innerHTML = `
      <div class="form-row">
        <label>From</label>
        <div class="selected-airport">${fromAp.name || fromAp.id} <span class="code">${fromAp.id}</span> — ${[fromAp.city, fromAp.country].filter(Boolean).join(", ")}</div>
      </div>
      <div class="form-row">
        <label>To</label>
        <input type="text" class="input" id="dest-search" placeholder="Search by code, city, country..." />
        <div class="airport-picker" id="dest-picker"></div>
      </div>
      <div class="form-row">
        <label>Plane (must own one)</label>
        <div id="tier-buttons"></div>
      </div>
      <div class="form-row" id="route-preview"></div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn ghost" id="modal-cancel">Cancel</button>
        <button class="btn primary" id="modal-confirm" disabled>Open route</button>
      </div>
    `;

    function renderPicker() {
      const q = searchTerm.toLowerCase();
      const list = airports
        .filter(a => a.id !== fromAp.id && isAirportUnlocked(a))
        .filter(a => !q || a.id.toLowerCase().includes(q) || (a.city||"").toLowerCase().includes(q) || (a.name||"").toLowerCase().includes(q) || (a.country||"").toLowerCase().includes(q))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 200);
      const picker = $("dest-picker");
      picker.innerHTML = list.length === 0
        ? `<div class="empty">No airports match.</div>`
        : list.map(a => `
            <div class="picker-item ${pickedTo && pickedTo.id === a.id ? "selected" : ""}" data-dest="${a.id}">
              <span class="picker-code">${a.id}</span>
              <span class="picker-name">${a.name}</span>
              <span class="picker-meta">${[a.city, a.country].filter(Boolean).join(", ")}</span>
            </div>
          `).join("");
      picker.querySelectorAll(".picker-item").forEach(el => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-dest");
          pickedTo = airportById.get(id);
          renderPicker();
          renderPreview();
        });
      });
    }

    function renderTierButtons() {
      const container = $("tier-buttons");
      container.innerHTML = PLANE_TYPES.map(p => {
        const canAfford = state.fleet[p.tier] > 0;
        const isSelected = pickedTier === p.tier;
        return `<button class="btn ${isSelected ? "primary" : ""}" data-tier="${p.tier}" ${canAfford ? "" : "disabled"} style="margin:3px;">${p.name}${canAfford ? ` (${state.fleet[p.tier]})` : ""}</button>`;
      }).join("");
      container.querySelectorAll("[data-tier]").forEach(el => {
        el.addEventListener("click", () => {
          pickedTier = parseInt(el.getAttribute("data-tier"), 10);
          renderTierButtons();
          renderPreview();
        });
      });
    }

    function renderPreview() {
      const preview = $("route-preview");
      if (pickedTo && pickedTier) {
        const km = haversineKm(fromAp, pickedTo);
        const plane = planeByTier(pickedTier);
        const inRange = km <= plane.range;
        const income = inRange ? plane.baseRate * Math.max(0.2, km/1000) : 0;
        preview.innerHTML = `
          <div class="kv"><span class="k">Distance</span><span class="v">${fmtNum(km)} km</span></div>
          <div class="kv"><span class="k">Plane</span><span class="v">${plane.name}</span></div>
          <div class="kv"><span class="k">Range</span><span class="v">${fmtNum(plane.range)} km</span></div>
          <div class="kv"><span class="k">Income</span><span class="v" style="color:${inRange ? "var(--info)" : "var(--bad)"}">${inRange ? fmtMoney(income) + "/s" : "OUT OF RANGE"}</span></div>
        `;
      } else {
        preview.innerHTML = "";
      }
      $("modal-confirm").disabled = !(pickedTo && pickedTier);
    }

    const search = $("dest-search");
    search.addEventListener("input", (e) => {
      searchTerm = e.target.value;
      renderPicker();
    });
    $("modal-cancel").addEventListener("click", closeModal);
    $("modal-confirm").addEventListener("click", () => {
      if (!pickedTo || !pickedTier) return;
      const ok = createRoute(fromAp.id, pickedTo.id, pickedTier);
      if (ok) closeModal();
    });

    modal.classList.remove("hidden");
    renderPicker();
    renderTierButtons();
    renderPreview();
    search.focus();
  }

  function closeModal() {
    $("modal").classList.add("hidden");
  }

  function makeMarker(ap) {
    const icon = L.divIcon({
      className: "",
      html: `<div class="airport-marker ${ap.type === "large_airport" ? "large" : "medium"} ${isAirportUnlocked(ap) ? "" : "locked"}" title="${ap.id}"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
    const m = L.marker([ap.lat, ap.lon], { icon, title: `${ap.id} — ${ap.name}` });
    m.on("click", () => {
      if (!isAirportUnlocked(ap)) {
        toast(`${ap.id} is a regional airport. Earn ${fmtMoney(UNLOCK_MEDIUM_AT)} to unlock.`, "warn");
        return;
      }
      showPanel("airport", { airportId: ap.id });
      map.flyTo([ap.lat, ap.lon], Math.max(map.getZoom(), 4), { duration: 0.6 });
    });
    markerById.set(ap.id, m);
    return m;
  }

  function drawRoute(route) {
    const a = airportById.get(route.from);
    const b = airportById.get(route.to);
    if (!a || !b) return;
    const points = greatCirclePath(a, b, 64);
    const line = L.polyline(points, {
      className: `route-line plane-${route.tier}`,
      weight: route.tier === 4 ? 2.5 : 2,
      opacity: 0.75,
      smoothFactor: 1,
    });
    line.on("click", () => {
      showPanel("airport", { airportId: route.from });
    });
    line.addTo(map);
    polylineByRouteId.set(route.id, line);
  }

  function removeRoutePolyline(routeId) {
    const line = polylineByRouteId.get(routeId);
    if (line) {
      map.removeLayer(line);
      polylineByRouteId.delete(routeId);
    }
  }

  function redrawAllRoutes() {
    polylineByRouteId.forEach(line => map.removeLayer(line));
    polylineByRouteId.clear();
    state.routes.forEach(drawRoute);
  }

  function refreshMarkerStyles() {
    airports.forEach(ap => {
      const m = markerById.get(ap.id);
      if (!m) return;
      const el = m.getElement();
      if (!el) return;
      const dot = el.querySelector(".airport-marker");
      if (!dot) return;
      dot.classList.toggle("locked", !isAirportUnlocked(ap));
      dot.classList.toggle("selected", ap.id === selectedAirportId);
    });
  }

  function renderTopBar() {
    $("stat-money").textContent = fmtMoney(state.cash);
    $("stat-income").textContent = fmtMoney(totalIncomePerSec());
    $("stat-routes").textContent = state.routes.length;
    $("stat-fleet").textContent = fleetSize();
  }

  function renderAll() {
    renderTopBar();
    renderPanel();
    refreshMarkerStyles();
  }

  function initMap() {
    map = L.map("map", {
      center: [25, 10],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      pane: "overlayPane",
    }).addTo(map);
    map.on("moveend zoomend", updateVisibleMarkers);
  }

  function loadAirports() {
    return fetch("/api/airports")
      .then(r => r.json())
      .then(data => {
        airports = data;
        airports.forEach(a => {
          a.isPrincipal = PRINCIPAL_AIRPORTS.has(a.id);
          airportById.set(a.id, a);
        });
      });
  }

  function shouldShowAirport(ap) {
    if (!isAirportUnlocked(ap)) return false;
    if (ap.isPrincipal) return true;
    if (!map) return false;
    if (map.getZoom() < MIN_ZOOM_FOR_VISIBLE) return false;
    if (!map.getBounds().contains([ap.lat, ap.lon])) return false;
    return true;
  }

  function updateVisibleMarkers() {
    if (!map) return;
    airports.forEach(ap => {
      const m = markerById.get(ap.id);
      if (!m) return;
      const show = shouldShowAirport(ap);
      const onMap = map.hasLayer(m);
      if (show && !onMap) m.addTo(map);
      else if (!show && onMap) map.removeLayer(m);
    });
  }

  function ensureMarkersExist() {
    airports.forEach(ap => {
      if (!markerById.has(ap.id)) makeMarker(ap);
    });
  }

  function placeMarkers() {
    ensureMarkersExist();
    updateVisibleMarkers();
  }

  function tick() {
    const income = totalIncomePerSec();
    if (income > 0) {
      state.cash += income;
      state.totalEarned += income;
    }
    tryUnlockMediumAirports();
    renderTopBar();
    if (panelMode === "hangar" || panelMode === "stats" || panelMode === "routes") renderPanel();
  }

  function bindTopBar() {
    $("btn-hangar").addEventListener("click", () => showPanel("hangar"));
    $("btn-routes").addEventListener("click", () => showPanel("routes"));
    $("btn-stats").addEventListener("click", () => showPanel("stats"));
    $("btn-save").addEventListener("click", () => { save(); toast("Game saved", "good"); });
    $("panel-close").addEventListener("click", hidePanel);
    $("modal-close").addEventListener("click", closeModal);
    $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("modal").classList.contains("hidden")) closeModal();
        else hidePanel();
      }
    });
    document.addEventListener("click", (e) => {
      const tgt = e.target.closest("[data-action='reset-save']");
      if (tgt) {
        if (confirm("Reset all progress? This cannot be undone.")) {
          localStorage.removeItem(SAVE_KEY);
          location.reload();
        }
      }
    });
    window.addEventListener("beforeunload", save);
  }

  function bindPanelDelegation() {
    $("panel-body").addEventListener("click", (e) => {
      const openHangar = e.target.closest("[data-action='open-hangar']");
      if (openHangar) showPanel("hangar");
    });
  }

  async function boot() {
    bindTopBar();
    bindPanelDelegation();
    initMap();
    try {
      await loadAirports();
    } catch (e) {
      toast("Failed to load airport data. Is the backend running?", "bad");
      return;
    }
    placeMarkers();
    const hadSave = load();
    if (hadSave) applyOfflineProgress();
    redrawAllRoutes();
    renderAll();
    setInterval(tick, TICK_MS);
    setInterval(save, AUTOSAVE_MS);
    if (!hadSave) {
      setTimeout(() => toast("Welcome, CEO! Click an airport to start.", "good"), 500);
    }
    if (typeof window !== "undefined") {
      window.__ifm = { map, state, get airports() { return airports; } };
    }
  }

  boot();
})();
