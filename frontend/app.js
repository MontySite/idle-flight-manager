(() => {
  "use strict";

  const SAVE_KEY = "ifm.save.v2";
  const SAVE_KEY_V1 = "ifm.save.v1";
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
  const UNLOCK_REALISTIC_AT = 5_000_000;

  const EVENT_TEMPLATES = [
    { type: "storm",          durationHours: 18,    demandMult: 0.40, appliesTo: "region",  baseProbPerGameHour: 0.040 },
    { type: "strike",         durationHours: 48,    demandMult: 0.00, appliesTo: "airport", baseProbPerGameHour: 0.010 },
    { type: "oil_shock",      durationHours: 720,   fuelMult: 1.60,    demandMult: 0.85, appliesTo: "global", baseProbPerGameHour: 0.003 },
    { type: "pandemic",       durationHours: 1440,  demandMult: 0.20, appliesTo: "global", baseProbPerGameHour: 0.0008 },
    { type: "festival",       durationHours: 72,    demandMult: 1.50, appliesTo: "airport", baseProbPerGameHour: 0.020 },
    { type: "security_alert", durationHours: 6,     demandMult: 0.50, appliesTo: "airport", baseProbPerGameHour: 0.005 },
  ];

  const EVENT_LABELS = {
    storm: "Storm",
    strike: "Strike",
    oil_shock: "Oil Shock",
    pandemic: "Pandemic",
    festival: "Festival",
    security_alert: "Security Alert",
  };

  const EVENT_ICONS = {
    storm: "\u26C8",
    strike: "\u2696",
    oil_shock: "\u26FD",
    pandemic: "\u2623",
    festival: "\u2728",
    security_alert: "\u26A0",
  };

  const EVENT_COLORS = {
    storm: "#38bdf8",
    strike: "#f97316",
    oil_shock: "#ef4444",
    pandemic: "#a78bfa",
    festival: "#f5b800",
    security_alert: "#fb923c",
  };

  const EVENT_TICK_HOURS_BUDGET_PER_TICK = 1;
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
    planes: [],
    nextPlaneId: 1,
    routes: [],
    nextRouteId: 1,
    mediumAirportsUnlocked: false,
    smallAirportsUnlocked: false,
    mode: "simplified",
    realisticUnlocked: false,
    reputation: 1.0,
    gameTimeHours: 0,
    fuelInventoryKg: 0,
    fuelPriceUsdPerKg: 0.80,
    co2InventoryTonnes: 0,
    personnel: { pilots: 0, cabinCrew: 0, groundCrew: 0 },
    campaigns: [],
    nextCampaignId: 1,
    events: [],
    stats: { paxCarried: 0, flightsDone: 0 },
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

  function routeEconomyCalc(route) {
    const a = airportById.get(route.from);
    const b = airportById.get(route.to);
    const plane = routePlane(route);
    const empty = {
      km: 0, flightHours: 0, cycleHours: 0, flightsPerSec: 0,
      paxWilling: 0, paxPerFlight: 0,
      farePerPax: 0, revenuePerSec: 0,
      costBreakdown: { fuel: 0, nav: 0, crew: 0, maint: 0, insurance: 0, landing: 0 },
      costPerSec: 0, profitPerSec: 0,
      tier: 0, grounded: true, groundedReason: "missing data",
      hubBonus: 0, seasonal: 1, eventMult: 1, priceMult: 1, repMult: 1,
      loadFactor: 0, efficiency: 1, fare: ECON_DATA.ECON.fareUsdPerPaxPerKm,
    };
    if (!a || !b || !plane) return empty;
    const variant = PLANE_DATA.variantById(plane.variantId);
    if (!variant) return empty;
    if (ECON_DATA.isGrounded(plane)) return { ...empty, tier: variant.tier, grounded: true, groundedReason: "low health", efficiency: ECON_DATA.efficiency(plane) };
    const km = haversineKm(a, b);
    if (km > variant.rangeKm) return { ...empty, km, tier: variant.tier, grounded: true, groundedReason: "out of range" };
    const realisticGate = realisticGroundedReason(plane);
    if (realisticGate) return { ...empty, km, tier: variant.tier, grounded: true, groundedReason: realisticGate, efficiency: ECON_DATA.efficiency(plane) };

    const farePerKm = (typeof route.farePerPaxPerKm === "number") ? route.farePerPaxPerKm : ECON_DATA.ECON.fareUsdPerPaxPerKm;
    const cycleHours = ECON_DATA.cycleHours(km, variant, a, b, state.routes);
    const flightsPerSec = 1 / (cycleHours * 3600);

    const baseDemand = ECON_DATA.computeBaseDemand(a, b, km);
    const seasonal = ECON_DATA.computeSeasonality(state.gameTimeHours);
    const eventMult = ECON_DATA.applyEventsToRoute(route, a, b, state.events);
    const priceMult = ECON_DATA.priceElasticity(farePerKm);
    const repMult = state.reputation;
    const hubBonus = ECON_DATA.computeHubBonus(a, b, state.routes);
    let marketingMult = 1;
    if (state.mode === "realistic" && state.campaigns) {
      const aRegion = ECON_DATA.countryRegion[a.country];
      const bRegion = ECON_DATA.countryRegion[b.country];
      for (const c of state.campaigns) {
        if (aRegion === c.region || bRegion === c.region) marketingMult *= c.demandMult ?? 1;
      }
    }
    const paxWilling = baseDemand * seasonal * eventMult * priceMult * repMult * (1 + hubBonus) * marketingMult;

    const efficiency = ECON_DATA.efficiency(plane);
    const seatsEffective = variant.seats * efficiency;
    const paxPerFlight = Math.max(0, Math.min(seatsEffective, paxWilling));
    const loadFactor = seatsEffective > 0 ? paxPerFlight / seatsEffective : 0;

    const cfg = plane.seatConfig || ECON_DATA.ECON.seatConfigDefault;
    const fareMult = (state.mode === "realistic")
      ? (cfg.economy * 1.0 + cfg.business * 2.5 + cfg.first * 5.0)
      : 1.0;
    const farePerPax = farePerKm * km * fareMult;
    const revenuePerFlight = paxPerFlight * farePerPax;
    const revenuePerSec = flightsPerSec * revenuePerFlight;

    const fuel = km * variant.fuelKgPerKm * currentFuelPrice();
    const nav = km * ECON_DATA.ECON.navFeeUsdPerKm;
    const crew = (km / variant.cruiseKmh) * ECON_DATA.ECON.crewUsdPerHour[variant.tier];
    const ageMult = 1.5 - plane.health / 100;
    const maint = (km / variant.cruiseKmh) * ECON_DATA.ECON.maintenanceUsdPerHour[variant.tier] * ageMult;
    const insurance = (km / variant.cruiseKmh) * ECON_DATA.ECON.insuranceUsdPerHour[variant.tier];
    const landingFee = ECON_DATA.landingFeePerPaxOf(a) + ECON_DATA.landingFeePerPaxOf(b);
    const landing = paxPerFlight * landingFee;
    const costPerFlight = fuel + nav + crew + maint + insurance + landing;
    const costPerSec = flightsPerSec * costPerFlight;
    const profitPerSec = revenuePerSec - costPerSec;

    return {
      km, flightHours: km / variant.cruiseKmh, cycleHours, flightsPerSec,
      paxWilling, paxPerFlight, farePerPax, revenuePerSec,
      costBreakdown: { fuel, nav, crew, maint, insurance, landing },
      costPerSec, profitPerSec,
      tier: variant.tier, grounded: false, groundedReason: "",
      hubBonus, seasonal, eventMult, priceMult, repMult, marketingMult,
      loadFactor, efficiency, fare: farePerKm,
    };
  }

  function routeIncome(route) {
    return routeEconomyCalc(route).profitPerSec;
  }

  function totalIncomePerSec() {
    let sum = 0;
    for (const r of state.routes) sum += routeEconomyCalc(r).profitPerSec;
    return sum;
  }

  function simulateRoute(route, dtSec) {
    const eco = routeEconomyCalc(route);
    if (eco.grounded) return eco;
    const profit = eco.profitPerSec * dtSec;
    state.cash += profit;
    if (eco.profitPerSec > 0) state.totalEarned += profit;
    state.stats.paxCarried += eco.paxPerFlight * eco.flightsPerSec * dtSec;
    state.stats.flightsDone += eco.flightsPerSec * dtSec;
    const plane = getPlane(route.planeId);
    if (plane) {
      const flightHoursDelta = eco.cycleHours * eco.flightsPerSec * dtSec;
      plane.ageHours += flightHoursDelta;
      plane.hoursSinceACheck = (plane.hoursSinceACheck || 0) + flightHoursDelta;
      plane.hoursSinceCCheck = (plane.hoursSinceCCheck || 0) + flightHoursDelta;
      const wear = (ECON_DATA.ECON.wearPerFlightByTier[eco.tier] || 0.1) * eco.flightsPerSec * dtSec;
      plane.health = Math.max(0, plane.health - wear);
      if (state.mode === "realistic") {
        const fuelKg = eco.km * variant_fuelKgPerKm(plane);
        state.fuelInventoryKg = Math.max(0, state.fuelInventoryKg - fuelKg * eco.flightsPerSec * dtSec);
        const co2T = (fuelKg * ECON_DATA.ECON.co2KgPerKgFuel) / 1000;
        state.co2InventoryTonnes = Math.max(0, state.co2InventoryTonnes - co2T * eco.flightsPerSec * dtSec);
      }
    }
    return eco;
  }

  function variant_fuelKgPerKm(plane) {
    const v = PLANE_DATA.variantById(plane.variantId);
    return v ? v.fuelKgPerKm : 0;
  }

  function applyReputationDrift(dtSec) {
    let netProfitRate = 0;
    for (const r of state.routes) netProfitRate += routeEconomyCalc(r).profitPerSec;
    const sign = netProfitRate >= 0 ? 1 : -1;
    const delta = sign * ECON_DATA.ECON.reputationDrift * Math.min(1, Math.abs(netProfitRate) / 100) * dtSec;
    state.reputation = ECON_DATA.clampReputation(state.reputation + delta);
  }

  function getPlane(planeId) {
    return state.planes.find(p => p.id === planeId) || null;
  }

  function planesByTier(tier) {
    const out = [];
    for (const p of state.planes) {
      const v = PLANE_DATA.variantById(p.variantId);
      if (v && v.tier === tier) out.push(p);
    }
    return out;
  }

  function unassignedPlanesByTier(tier) {
    return planesByTier(tier).filter(p => !p.assignedRouteId);
  }

  function routePlane(route) {
    return getPlane(route.planeId);
  }

  function fleetSize() {
    return state.planes.length;
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
      let raw = localStorage.getItem(SAVE_KEY);
      let data = null;
      if (raw) {
        data = JSON.parse(raw);
      } else {
        const v1raw = localStorage.getItem(SAVE_KEY_V1);
        if (v1raw) {
          data = migrateV1ToV2(JSON.parse(v1raw));
        }
      }
      if (!data) return false;
      Object.assign(state, data);
      if (!Array.isArray(state.planes)) state.planes = [];
      if (typeof state.nextPlaneId !== "number") state.nextPlaneId = 1;
      if (typeof state.reputation !== "number") state.reputation = 1.0;
      if (!state.personnel) state.personnel = { pilots: 0, cabinCrew: 0, groundCrew: 0 };
      if (typeof state.fuelInventoryKg !== "number") state.fuelInventoryKg = 0;
      if (typeof state.co2InventoryTonnes !== "number") state.co2InventoryTonnes = 0;
      if (typeof state.fuelPriceUsdPerKg !== "number") state.fuelPriceUsdPerKg = 0.80;
      if (!Array.isArray(state.campaigns)) state.campaigns = [];
      if (typeof state.nextCampaignId !== "number") state.nextCampaignId = 1;
      if (!Array.isArray(state.events)) state.events = [];
      if (typeof state.nextEventId !== "number") state.nextEventId = 1;
      if (!state.stats) state.stats = { paxCarried: 0, flightsDone: 0 };
      for (const p of state.planes) {
        if (typeof p.hoursSinceACheck !== "number") p.hoursSinceACheck = 0;
        if (typeof p.hoursSinceCCheck !== "number") p.hoursSinceCCheck = 0;
        if (!p.seatConfig) p.seatConfig = { ...ECON_DATA.ECON.seatConfigDefault };
      }
      for (const r of state.routes) {
        if (typeof r.tier !== "undefined" && !r.planeId) r.tier = r.tier;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function migrateV1ToV2(v1) {
    const next = Object.assign({}, v1);
    delete next.fleet;
    next.planes = [];
    next.nextPlaneId = 1;
    const tierVariants = {
      1: PLANE_DATA.cheapestVariantForTier(1)?.id,
      2: PLANE_DATA.cheapestVariantForTier(2)?.id,
      3: PLANE_DATA.cheapestVariantForTier(3)?.id,
      4: PLANE_DATA.cheapestVariantForTier(4)?.id,
    };
    const v1fleet = v1.fleet || {};
    for (const tierStr of Object.keys(v1fleet)) {
      const tier = parseInt(tierStr, 10);
      const count = v1fleet[tier] || 0;
      const variantId = tierVariants[tier];
      if (!variantId) continue;
      for (let i = 0; i < count; i++) {
        next.planes.push({
          id: next.nextPlaneId++,
          variantId,
          ageHours: 0,
          health: 100,
          seatConfig: { economy: 0.80, business: 0.15, first: 0.05 },
          assignedRouteId: null,
        });
      }
    }
    if (Array.isArray(v1.routes)) {
      for (const r of v1.routes) {
        if (r.tier && !r.planeId) {
          const free = next.planes.find(p => {
            const v = PLANE_DATA.variantById(p.variantId);
            return v && v.tier === r.tier && !p.assignedRouteId;
          });
          if (free) {
            r.planeId = free.id;
            free.assignedRouteId = r.id;
          }
        }
        delete r.tier;
      }
    }
    return next;
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

  function canPurchase(variantId) {
    return PLANE_DATA.canPurchaseVariant(variantId, state.planes);
  }

  function buyPlane(variantId) {
    const variant = PLANE_DATA.variantById(variantId);
    if (!variant) { toast("Unknown plane", "bad"); return; }
    if (!canPurchase(variantId)) {
      toast(`${variant.name} is not yet unlocked`, "bad");
      return;
    }
    if (state.cash < variant.cost) {
      toast("Not enough cash to buy a " + variant.name, "bad");
      return;
    }
    state.cash -= variant.cost;
    const plane = {
      id: state.nextPlaneId++,
      variantId,
      ageHours: 0,
      health: 100,
      hoursSinceACheck: 0,
      hoursSinceCCheck: 0,
      seatConfig: { ...ECON_DATA.ECON.seatConfigDefault },
      assignedRouteId: null,
    };
    state.planes.push(plane);
    toast(`Purchased ${variant.name} for ${fmtMoney(variant.cost)}`, "good");
    save();
    renderAll();
  }

  function sellPlane(variantId) {
    const variant = PLANE_DATA.variantById(variantId);
    if (!variant) return;
    const plane = state.planes.find(p => p.variantId === variantId && !p.assignedRouteId);
    if (!plane) {
      toast(`No unassigned ${variant.name} to sell`, "warn");
      return;
    }
    const refund = Math.floor(variant.cost * 0.5);
    state.planes = state.planes.filter(p => p.id !== plane.id);
    state.cash += refund;
    toast(`Sold a ${variant.name} for ${fmtMoney(refund)}`, "warn");
    save();
    renderAll();
  }

  function createRoute(fromId, toId, tier) {
    const from = airportById.get(fromId);
    const to = airportById.get(toId);
    if (!from || !to) { toast("Unknown airport", "bad"); return false; }
    if (fromId === toId) { toast("Origin and destination must differ", "bad"); return false; }
    const km = haversineKm(from, to);
    const candidates = unassignedPlanesByTier(tier);
    const candidate = candidates
      .map(p => ({ plane: p, variant: PLANE_DATA.variantById(p.variantId) }))
      .find(({ variant }) => variant && variant.rangeKm >= km) || null;
    if (!candidate) {
      const sample = PLANE_DATA.variantsByTier(tier)[0];
      const name = sample ? sample.name : `Tier ${tier}`;
      toast(`No ${name} in your hangar with range for ${fmtNum(km)} km`, "bad");
      return false;
    }
    if (state.routes.some(r => r.from === fromId && r.to === toId)) {
      toast("A route already exists between these airports", "warn");
      return false;
    }
    const route = {
      id: state.nextRouteId++,
      from: fromId,
      to: toId,
      planeId: candidate.plane.id,
      createdAt: Date.now(),
    };
    candidate.plane.assignedRouteId = route.id;
    state.routes.push(route);
    const income = routeIncome(route);
    toast(`Route ${fromId} → ${toId} opened with ${candidate.variant.name} (+${fmtMoney(income)}/s)`, "good");
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
    const plane = getPlane(r.planeId);
    if (plane) plane.assignedRouteId = null;
    removeRoutePolyline(routeId);
    const variant = plane ? PLANE_DATA.variantById(plane.variantId) : null;
    toast(`Route closed, ${variant ? variant.name : "plane"} returned to hangar`, "warn");
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

  const GAME_MODES = {
    simplified: {
      label: "Simplified",
      color: "var(--text-dim)",
      features: {
        fuelMarket: false,
        co2Trading: false,
        personnelHiring: false,
        maintenanceScheduling: false,
        seatConfig: false,
        marketingCampaigns: false,
        alliances: false,
      },
    },
    realistic: {
      label: "Realistic",
      color: "var(--accent)",
      features: {
        fuelMarket: true,
        co2Trading: true,
        personnelHiring: true,
        maintenanceScheduling: true,
        seatConfig: true,
        marketingCampaigns: true,
        alliances: true,
      },
    },
  };

  function modeConfig() {
    return GAME_MODES[state.mode] || GAME_MODES.simplified;
  }

  function tryUnlockRealisticMode() {
    if (state.realisticUnlocked) return false;
    if (state.totalEarned < UNLOCK_REALISTIC_AT) return false;
    openRealisticModePrompt();
    return true;
  }

  function openRealisticModePrompt() {
    const modal = $("modal");
    const body = $("modal-body");
    const title = $("modal-title");
    title.textContent = "Realistic Mode Unlocked";
    body.innerHTML = `
      <p style="color:var(--text-dim); font-size:13px; line-height:1.6; margin:0 0 12px;">
        You've earned <strong style="color:var(--accent)">${fmtMoney(UNLOCK_REALISTIC_AT)}</strong>.
        A more detailed simulation is now available.
      </p>
      <p style="color:var(--text); font-size:13px; line-height:1.6; margin:0 0 12px;">
        <strong>Realistic Mode</strong> adds:
      </p>
      <ul style="color:var(--text-dim); font-size:12px; line-height:1.7; margin:0 0 12px; padding-left:18px;">
        <li>Fuel market with price volatility and inventory</li>
        <li>CO2 emissions and trading</li>
        <li>Pilots, cabin crew, ground crew hiring</li>
        <li>Scheduled A-check / C-check maintenance</li>
        <li>Economy / business / first class seat config</li>
        <li>Marketing campaigns (coming soon)</li>
        <li>Alliances (coming soon)</li>
      </ul>
      <p style="color:var(--bad); font-size:12px; line-height:1.5; margin:0 0 4px;">
        This choice is <strong>irreversible</strong>. You can stay in Simplified Mode as long as you want.
      </p>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button class="btn ghost" id="modal-cancel">Stay Simplified</button>
        <button class="btn primary" id="modal-confirm">Switch to Realistic</button>
      </div>
    `;
    modal.classList.remove("hidden");
    $("modal-cancel").addEventListener("click", closeModal);
    $("modal-confirm").addEventListener("click", () => {
      state.realisticUnlocked = true;
      state.mode = "realistic";
      toast("Switched to Realistic Mode — fuel, CO2, personnel live", "good");
      save();
      closeModal();
      renderAll();
    });
  }

  function openModeInfoModal() {
    const modal = $("modal");
    const body = $("modal-body");
    const title = $("modal-title");
    title.textContent = "Game Mode";
    const cfg = modeConfig();
    const featureRows = [
      ["Fuel market", "fuelMarket"],
      ["CO2 emissions & trading", "co2Trading"],
      ["Personnel hiring", "personnelHiring"],
      ["Scheduled maintenance", "maintenanceScheduling"],
      ["Seat configuration", "seatConfig"],
      ["Marketing campaigns", "marketingCampaigns"],
      ["Alliances", "alliances"],
    ].map(([label, key]) => {
      const enabled = cfg.features[key];
      return `<div class="kv"><span class="k">${label}</span><span class="v" style="color:${enabled ? "var(--good)" : "var(--text-faint)"}">${enabled ? "Enabled" : "Disabled"}</span></div>`;
    }).join("");
    const unlockHint = state.realisticUnlocked
      ? `<p style="color:var(--text-dim); font-size:12px; margin:8px 0 0;">You are in <strong style="color:${cfg.color}">${cfg.label}</strong> mode.</p>`
      : `<p style="color:var(--text-dim); font-size:12px; margin:8px 0 0;">
          Unlock <strong style="color:var(--accent)">Realistic Mode</strong> at <strong>${fmtMoney(UNLOCK_REALISTIC_AT)}</strong> total earned
          (currently ${fmtMoney(state.totalEarned)}, ${Math.min(100, (state.totalEarned/UNLOCK_REALISTIC_AT)*100).toFixed(1)}%).
        </p>`;
    body.innerHTML = `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:12px; margin:0 0 8px;">
          <strong style="color:${cfg.color}">${cfg.label}</strong> — current simulation depth.
        </p>
        <h3>Features</h3>
        ${featureRows}
        ${unlockHint}
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn ghost" id="modal-cancel">Close</button>
      </div>
    `;
    modal.classList.remove("hidden");
    $("modal-cancel").addEventListener("click", closeModal);
  }

  function currentFuelMult() {
    let m = 1;
    for (const e of state.events) {
      if (e.fuelMult && e.fuelMult > 1) m = Math.max(m, e.fuelMult);
    }
    return m;
  }

  function currentFuelPrice() {
    return ECON_DATA.ECON.fuelPriceUsdPerKg * currentFuelMult();
  }

  function pickEventTarget(tmpl) {
    if (tmpl.appliesTo === "global") return {};
    if (tmpl.appliesTo === "region") {
      const groups = ECON_DATA.REGION_GROUPS;
      const g = groups[Math.floor(Math.random() * groups.length)];
      return { region: g.code };
    }
    if (tmpl.appliesTo === "airport") {
      const pool = new Set();
      for (const r of state.routes) { pool.add(r.from); pool.add(r.to); }
      let list = [...pool].map(id => airportById.get(id)).filter(Boolean);
      if (list.length === 0) list = airports;
      const ap = list[Math.floor(Math.random() * list.length)];
      return { airportId: ap.id, airportName: ap.name || ap.id };
    }
    return {};
  }

  function createEvent(tmpl) {
    return {
      id: (state.nextEventId = (state.nextEventId || 1)),
      type: tmpl.type,
      durationHours: tmpl.durationHours,
      hoursRemaining: tmpl.durationHours,
      demandMult: tmpl.demandMult ?? 1.0,
      fuelMult: tmpl.fuelMult ?? 1.0,
      appliesTo: tmpl.appliesTo,
      startedAt: state.gameTimeHours,
      ...pickEventTarget(tmpl),
    };
  }

  function hasActiveEventOfType(type) {
    return state.events.some(e => e.type === type);
  }

  function applyEventTick(dtGameHours) {
    for (const tmpl of EVENT_TEMPLATES) {
      const p = tmpl.baseProbPerGameHour * dtGameHours;
      if (Math.random() < p) {
        if (tmpl.type === "oil_shock" && hasActiveEventOfType("oil_shock")) continue;
        if (hasActiveEventOfType(tmpl.type) && (tmpl.type === "pandemic" || tmpl.type === "festival" || tmpl.type === "strike" || tmpl.type === "security_alert" || tmpl.type === "storm")) continue;
        const ev = createEvent(tmpl);
        if (ev) {
          state.events.push(ev);
          const label = EVENT_LABELS[ev.type] || ev.type;
          const target = ev.region || ev.airportId || "the world";
          const kind = (ev.demandMult ?? 1) < 1 ? "warn" : "good";
          toast(`${label} affecting ${target} (${Math.round(ev.hoursRemaining)}h)`, kind);
        }
      }
    }
    for (let i = state.events.length - 1; i >= 0; i--) {
      state.events[i].hoursRemaining -= dtGameHours;
      if (state.events[i].hoursRemaining <= 0) {
        const removed = state.events.splice(i, 1)[0];
        const label = EVENT_LABELS[removed.type] || removed.type;
        toast(`${label} ended`, "good");
      }
    }
  }

  function initRealisticInventoryIfNeeded() {
    if (state.fuelPriceUsdPerKg == null) state.fuelPriceUsdPerKg = ECON_DATA.ECON.fuelPriceUsdPerKg;
    if (!state.personnel) state.personnel = { pilots: 0, cabinCrew: 0, groundCrew: 0 };
    if (state.co2InventoryTonnes == null) state.co2InventoryTonnes = ECON_DATA.ECON.initialCo2Tonnes;
    if (state.fuelInventoryKg == null) state.fuelInventoryKg = ECON_DATA.ECON.initialFuelKg;
    if (!Array.isArray(state.campaigns)) state.campaigns = [];
  }

  function updateFuelPrice(dtGameHours) {
    if (state.mode !== "realistic") {
      state.fuelPriceUsdPerKg = ECON_DATA.ECON.fuelPriceUsdPerKg;
      return;
    }
    const mult = currentFuelMult();
    const target = ECON_DATA.ECON.fuelPriceUsdPerKg * mult;
    const drift = (target - state.fuelPriceUsdPerKg) * ECON_DATA.ECON.fuelPriceMeanReversion;
    const noise = (Math.random() - 0.5) * state.fuelPriceUsdPerKg * ECON_DATA.ECON.fuelPriceVolatility;
    const next = state.fuelPriceUsdPerKg + drift + noise;
    state.fuelPriceUsdPerKg = Math.max(ECON_DATA.ECON.fuelPriceMin, Math.min(ECON_DATA.ECON.fuelPriceMax, next));
  }

  function buyFuel(kg) {
    if (kg <= 0) return;
    const cost = kg * state.fuelPriceUsdPerKg;
    if (state.cash < cost) {
      toast(`Not enough cash to buy ${fmtNum(kg)} kg fuel`, "bad");
      return;
    }
    state.cash -= cost;
    state.fuelInventoryKg += kg;
    toast(`Bought ${fmtNum(kg)} kg fuel for ${fmtMoney(cost)} (${fmtMoney(state.fuelPriceUsdPerKg)}/kg)`, "good");
    save();
    renderAll();
  }

  function buyCO2(tonnes) {
    if (tonnes <= 0) return;
    const cost = tonnes * ECON_DATA.ECON.co2PricePerTonne;
    if (state.cash < cost) {
      toast(`Not enough cash to buy ${fmtNum(tonnes)}t CO2`, "bad");
      return;
    }
    state.cash -= cost;
    state.co2InventoryTonnes += tonnes;
    toast(`Bought ${fmtNum(tonnes)}t CO2 allowances for ${fmtMoney(cost)}`, "good");
    save();
    renderAll();
  }

  function planePersonnelRequirements(plane) {
    if (!plane) return { pilots: 0, cabinCrew: 0, groundCrew: 0 };
    const variant = PLANE_DATA.variantById(plane.variantId);
    if (!variant) return { pilots: 0, cabinCrew: 0, groundCrew: 0 };
    return {
      pilots: ECON_DATA.ECON.pilotPerPlane,
      cabinCrew: Math.max(1, Math.ceil(variant.seats / ECON_DATA.ECON.cabinCrewPerSeats)),
      groundCrew: ECON_DATA.ECON.groundCrewPerPlane,
    };
  }

  function hirePersonnel(kind, count) {
    if (count <= 0) return;
    const costKey = kind === "pilots" ? "pilotHiringCost" : kind === "cabinCrew" ? "cabinCrewHiringCost" : "groundCrewHiringCost";
    const cost = count * ECON_DATA.ECON[costKey];
    if (state.cash < cost) {
      toast(`Not enough cash to hire ${count} ${kind}`, "bad");
      return;
    }
    state.cash -= cost;
    state.personnel[kind] += count;
    toast(`Hired ${count} ${kind} for ${fmtMoney(cost)}`, "good");
    save();
    renderAll();
  }

  function monthlySalaries() {
    return ECON_DATA.ECON.pilotSalaryPerMonth * state.personnel.pilots
         + ECON_DATA.ECON.cabinCrewSalaryPerMonth * state.personnel.cabinCrew
         + ECON_DATA.ECON.groundCrewSalaryPerMonth * state.personnel.groundCrew;
  }

  function applySalaries(dtGameHours) {
    const perHour = monthlySalaries() / (30 * 24);
    state.cash -= perHour * dtGameHours;
  }

  function doMaintenanceCheck(planeId, kind) {
    const plane = getPlane(planeId);
    if (!plane) return;
    const variant = PLANE_DATA.variantById(plane.variantId);
    if (!variant) return;
    const E = ECON_DATA.ECON;
    const hourlyMaint = E.maintenanceUsdPerHour[variant.tier];
    if (kind === "a-check") {
      const cost = hourlyMaint * E.aCheckCostMultiplier;
      if (state.cash < cost) { toast(`Need ${fmtMoney(cost)} for A-check`, "bad"); return; }
      state.cash -= cost;
      plane.hoursSinceACheck = 0;
      plane.health = Math.min(100, plane.health + E.aCheckHealthRestore);
      toast(`A-check done on ${variant.name} for ${fmtMoney(cost)}, +${E.aCheckHealthRestore}hp`, "good");
    } else if (kind === "c-check") {
      const cost = hourlyMaint * E.cCheckCostMultiplier;
      if (state.cash < cost) { toast(`Need ${fmtMoney(cost)} for C-check`, "bad"); return; }
      state.cash -= cost;
      plane.hoursSinceCCheck = 0;
      plane.hoursSinceACheck = 0;
      plane.health = E.healthFull;
      toast(`C-check done on ${variant.name} for ${fmtMoney(cost)}, plane fully restored`, "good");
    } else if (kind === "line") {
      const cost = hourlyMaint * E.lineMaintCostMultiplier;
      if (state.cash < cost) { toast(`Need ${fmtMoney(cost)} for line maintenance`, "bad"); return; }
      state.cash -= cost;
      plane.health = Math.min(100, plane.health + E.lineMaintHealthRestore);
      toast(`Line maintenance on ${variant.name} for ${fmtMoney(cost)}, +${E.lineMaintHealthRestore}hp`, "good");
    }
    save();
    renderAll();
  }

  function setSeatConfig(planeId, klass, value) {
    const plane = getPlane(planeId);
    if (!plane) return;
    plane.seatConfig[klass] = Math.max(0, Math.min(1, value));
    const sum = plane.seatConfig.economy + plane.seatConfig.business + plane.seatConfig.first;
    if (sum > 0 && Math.abs(sum - 1) > 0.01) {
      const scale = 1 / sum;
      plane.seatConfig.economy *= scale;
      plane.seatConfig.business *= scale;
      plane.seatConfig.first *= scale;
    }
    save();
    renderAll();
  }

  function startMarketingCampaign(region) {
    const E = ECON_DATA.ECON;
    if (state.campaigns.length >= E.marketingMaxActive) {
      toast(`Max ${E.marketingMaxActive} active campaigns`, "warn");
      return;
    }
    const cost = E.marketingCostPerRegion;
    if (state.cash < cost) {
      toast(`Need ${fmtMoney(cost)} for marketing in ${region}`, "bad");
      return;
    }
    state.cash -= cost;
    state.campaigns.push({
      id: ++state.nextCampaignId,
      region,
      demandMult: E.marketingDemandMult,
      durationHours: E.marketingDurationHours,
      hoursRemaining: E.marketingDurationHours,
    });
    toast(`Marketing campaign started in ${region} for ${E.marketingDurationHours}h`, "good");
    save();
    renderAll();
  }

  function applyMarketingTick(dtGameHours) {
    for (let i = state.campaigns.length - 1; i >= 0; i--) {
      state.campaigns[i].hoursRemaining -= dtGameHours;
      if (state.campaigns[i].hoursRemaining <= 0) {
        const removed = state.campaigns.splice(i, 1)[0];
        toast(`Marketing in ${removed.region} ended`, "good");
      }
    }
  }

  function realisticGroundedReason(plane) {
    if (!plane) return "no plane";
    if (state.mode !== "realistic") return null;
    if (state.fuelInventoryKg <= 0) return "out of fuel";
    if (state.co2InventoryTonnes <= 0) return "out of CO2";
    const req = planePersonnelRequirements(plane);
    if (state.personnel.pilots < req.pilots) return "need pilots";
    if (state.personnel.cabinCrew < req.cabinCrew) return "need cabin crew";
    if (state.personnel.groundCrew < req.groundCrew) return "need ground crew";
    if (plane.hoursSinceCCheck >= ECON_DATA.ECON.cCheckFlightHours) return "C-check overdue";
    return null;
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
    if (panelMode === "events") {
      titleEl.textContent = "Events";
      bodyEl.innerHTML = renderEventsPanel();
      return;
    }
    if (panelMode === "resources") {
      titleEl.textContent = "Resources";
      bodyEl.innerHTML = renderResourcesPanel();
      bindResourcesPanelEvents();
      return;
    }
    titleEl.textContent = "Welcome, CEO";
    bodyEl.innerHTML = renderWelcomePanel();
  }

  function bindResourcesPanelEvents() {
    const body = $("panel-body");
    body.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => {
        const action = el.getAttribute("data-action");
        if (action === "buy-fuel") {
          buyFuel(parseFloat(el.getAttribute("data-kg")));
        } else if (action === "buy-co2") {
          buyCO2(parseFloat(el.getAttribute("data-tonnes")));
        } else if (action === "hire") {
          hirePersonnel(el.getAttribute("data-kind"), parseInt(el.getAttribute("data-count"), 10));
        } else if (action === "start-campaign") {
          startMarketingCampaign(el.getAttribute("data-region"));
        }
      });
    });
  }

  function eventTargetLabel(ev) {
    if (ev.appliesTo === "global") return "Global";
    if (ev.appliesTo === "region") return `Region ${ev.region}`;
    if (ev.appliesTo === "airport") {
      const ap = ev.airportId ? airportById.get(ev.airportId) : null;
      return ap ? `${ev.airportId} (${ap.name || ap.id})` : ev.airportId;
    }
    return "—";
  }

  function renderEventsPanel() {
    const active = [...state.events].sort((a, b) => a.hoursRemaining - b.hoursRemaining);
    const fuelMult = currentFuelMult();
    const fuelPrice = currentFuelPrice();
    const basePrice = ECON_DATA.ECON.fuelPriceUsdPerKg;
    return `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:12px; margin:0 0 8px;">
          Random world events affect demand, fuel prices, and operations.
        </p>
        <div class="kv"><span class="k">Fuel price</span><span class="v" style="color:${fuelMult > 1.05 ? "var(--bad)" : fuelMult < 0.95 ? "var(--good)" : "var(--text)"}">${fmtMoney(fuelPrice)}/kg</span></div>
        <div class="kv"><span class="k">Fuel multiplier</span><span class="v">${fuelMult.toFixed(2)}×</span></div>
      </div>
      <div class="panel-section">
        <h3>Active events (${active.length})</h3>
        ${active.length === 0 ? `<div class="empty">No active events.</div>` : active.map(ev => {
          const label = EVENT_LABELS[ev.type] || ev.type;
          const icon = EVENT_ICONS[ev.type] || "";
          const color = EVENT_COLORS[ev.type] || "var(--text-dim)";
          const dm = ev.demandMult ?? 1.0;
          const fm = ev.fuelMult ?? 1.0;
          const total = ev.durationHours;
          const remaining = ev.hoursRemaining;
          const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
          const target = eventTargetLabel(ev);
          return `
            <div class="event-card" style="border-left-color:${color};">
              <div class="event-header">
                <span class="event-icon" style="color:${color};">${icon}</span>
                <span class="event-label">${label}</span>
                <span class="event-target">${target}</span>
              </div>
              <div class="event-progress">
                <div class="event-progress-fill" style="width:${pct}%; background:${color};"></div>
              </div>
              <div class="event-meta">
                <span>${remaining > 0 ? Math.round(remaining) + "h left" : "ending"}</span>
                <span>demand ${dm.toFixed(2)}×${fm > 1 ? ` · fuel ${fm.toFixed(2)}×` : ""}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="panel-section">
        <h3>Event types</h3>
        ${EVENT_TEMPLATES.map(t => `
          <div class="kv">
            <span class="k">${EVENT_ICONS[t.type] || ""} ${EVENT_LABELS[t.type] || t.type}</span>
            <span class="v" style="color:var(--text-faint); font-size:11px;">
              ${t.appliesTo} · ${Math.round(t.durationHours)}h · demand ${(t.demandMult ?? 1).toFixed(2)}×${t.fuelMult ? ` · fuel ${t.fuelMult.toFixed(2)}×` : ""}
            </span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderResourcesPanel() {
    const E = ECON_DATA.ECON;
    const fuelPrice = state.fuelPriceUsdPerKg || E.fuelPriceUsdPerKg;
    const fuelCrit = state.fuelInventoryKg < 100;
    const co2Crit = state.co2InventoryTonnes < 0.1;
    const paxPilotsReq = state.planes.filter(p => p.assignedRouteId).length * E.pilotPerPlane;
    const paxCabinReq = state.planes.filter(p => p.assignedRouteId).reduce((sum, p) => {
      const v = PLANE_DATA.variantById(p.variantId);
      return sum + (v ? Math.max(1, Math.ceil(v.seats / E.cabinCrewPerSeats)) : 0);
    }, 0);
    const paxGroundReq = state.planes.filter(p => p.assignedRouteId).length * E.groundCrewPerPlane;
    return `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:12px; margin:0 0 8px;">
          Realistic-mode operations: fuel, CO2, crew, and marketing.
        </p>
      </div>
      <div class="panel-section">
        <h3>Fuel</h3>
        <div class="kv"><span class="k">Inventory</span><span class="v ${fuelCrit ? "profit-neg" : ""}">${fmtNum(Math.round(state.fuelInventoryKg))} kg</span></div>
        <div class="kv"><span class="k">Price</span><span class="v">${fmtMoney(fuelPrice)}/kg</span></div>
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button class="btn" data-action="buy-fuel" data-kg="1000">+1,000kg</button>
          <button class="btn" data-action="buy-fuel" data-kg="10000">+10,000kg</button>
          <button class="btn" data-action="buy-fuel" data-kg="100000">+100,000kg</button>
        </div>
      </div>
      <div class="panel-section">
        <h3>CO2 allowances</h3>
        <div class="kv"><span class="k">Inventory</span><span class="v ${co2Crit ? "profit-neg" : ""}">${fmtNum(state.co2InventoryTonnes)} t</span></div>
        <div class="kv"><span class="k">Price</span><span class="v">${fmtMoney(E.co2PricePerTonne)}/t</span></div>
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button class="btn" data-action="buy-co2" data-tonnes="1">+1t</button>
          <button class="btn" data-action="buy-co2" data-tonnes="10">+10t</button>
          <button class="btn" data-action="buy-co2" data-tonnes="100">+100t</button>
        </div>
      </div>
      <div class="panel-section">
        <h3>Personnel</h3>
        <div class="kv"><span class="k">Pilots</span><span class="v">${state.personnel.pilots} <span style="color:var(--text-faint); font-size:11px;">(need ${paxPilotsReq})</span></span></div>
        <div class="kv"><span class="k">Cabin crew</span><span class="v">${state.personnel.cabinCrew} <span style="color:var(--text-faint); font-size:11px;">(need ${paxCabinReq})</span></span></div>
        <div class="kv"><span class="k">Ground crew</span><span class="v">${state.personnel.groundCrew} <span style="color:var(--text-faint); font-size:11px;">(need ${paxGroundReq})</span></span></div>
        <div class="kv"><span class="k">Monthly salary</span><span class="v" style="color:var(--bad);">-${fmtMoney(monthlySalaries())}/mo</span></div>
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button class="btn" data-action="hire" data-kind="pilots" data-count="1">+1 Pilot</button>
          <button class="btn" data-action="hire" data-kind="pilots" data-count="5">+5 Pilots</button>
        </div>
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          <button class="btn" data-action="hire" data-kind="cabinCrew" data-count="1">+1 Cabin</button>
          <button class="btn" data-action="hire" data-kind="cabinCrew" data-count="5">+5 Cabin</button>
        </div>
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          <button class="btn" data-action="hire" data-kind="groundCrew" data-count="1">+1 Ground</button>
          <button class="btn" data-action="hire" data-kind="groundCrew" data-count="3">+3 Ground</button>
        </div>
      </div>
      <div class="panel-section">
        <h3>Marketing campaigns</h3>
        <p style="color:var(--text-dim); font-size:11px; margin:0 0 8px;">
          Boosts demand ×${E.marketingDemandMult} for ${E.marketingDurationHours}h on chosen region.
          Cost: ${fmtMoney(E.marketingCostPerRegion)}/campaign. Max ${E.marketingMaxActive} active.
        </p>
        ${state.campaigns.length === 0 ? `<div class="empty">No active campaigns.</div>` : state.campaigns.map(c => {
          const pct = Math.max(0, Math.min(100, ((c.durationHours - c.hoursRemaining) / c.durationHours) * 100));
          return `
            <div class="event-card" style="border-left-color:var(--info);">
              <div class="event-header">
                <span class="event-icon" style="color:var(--info);">&#128227;</span>
                <span class="event-label">Marketing</span>
                <span class="event-target">${c.region}</span>
              </div>
              <div class="event-progress"><div class="event-progress-fill" style="width:${pct}%; background:var(--info);"></div></div>
              <div class="event-meta"><span>${Math.max(0, Math.round(c.hoursRemaining))}h left</span><span>demand ${c.demandMult.toFixed(2)}×</span></div>
            </div>
          `;
        }).join("")}
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:8px;">
          <button class="btn" data-action="start-campaign" data-region="EU">EU</button>
          <button class="btn" data-action="start-campaign" data-region="NA">NA</button>
          <button class="btn" data-action="start-campaign" data-region="AS">AS</button>
          <button class="btn" data-action="start-campaign" data-region="SA">SA</button>
          <button class="btn" data-action="start-campaign" data-region="AF">AF</button>
          <button class="btn" data-action="start-campaign" data-region="OC">OC</button>
        </div>
      </div>
    `;
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
        <div class="kv"><span class="k">Unlock Realistic mode</span><span class="v">${state.realisticUnlocked ? "✓" : fmtMoney(UNLOCK_REALISTIC_AT)}</span></div>
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
      const plane = routePlane(r);
      const variant = plane ? PLANE_DATA.variantById(plane.variantId) : null;
      const tier = variant ? variant.tier : 1;
      const code = variant ? variant.name : "?";
      return `
        <div class="route-item">
          <div class="route-codes">${ap.id} <span class="arrow">${direction}</span> ${other}</div>
          <div class="route-meta">
            <span class="plane-pill tier-${tier}">${code}</span>
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

  function isNextToUnlock(variant) {
    if (!variant.unlockBy) return false;
    if (canPurchase(variant.id)) return false;
    const owned = PLANE_DATA.ownedCount(state.planes, variant.unlockBy.prev);
    return (variant.unlockBy.count - owned) === 1;
  }

  function variantProgressText(variant) {
    if (!variant.unlockBy) return null;
    const req = variant.unlockBy;
    if (req.brand) {
      const prevV = PLANE_DATA.variantById(req.prev);
      const owned = state.planes.filter(p => p.variantId === req.prev).length;
      const label = prevV ? prevV.name : req.prev;
      return `Own ${req.count}× ${label} of ${req.brand} (have ${owned})`;
    }
    const owned = PLANE_DATA.ownedCount(state.planes, req.prev);
    const prevV = PLANE_DATA.variantById(req.prev);
    const label = prevV ? prevV.name : req.prev;
    return `Own ${req.count}× ${label} (have ${owned})`;
  }

  function renderVariantCard(v) {
    const owned = state.planes.filter(p => p.variantId === v.id).length;
    const unassigned = state.planes.filter(p => p.variantId === v.id && !p.assignedRouteId).length;
    const unlocked = canPurchase(v.id);
    const next = isNextToUnlock(v);
    const canBuy = unlocked && state.cash >= v.cost;
    const canSell = unassigned > 0;
    const progress = unlocked ? null : variantProgressText(v);
    return `
      <div class="variant-card tier-${v.tier} ${unlocked ? "" : "locked"} ${next ? "next-unlock" : ""}">
        <div class="variant-header">
          <span class="variant-name">${v.name}</span>
          <span class="variant-tier tier-${v.tier}">T${v.tier}</span>
          <span class="variant-owned" title="Owned">${owned}</span>
        </div>
        <div class="variant-specs">
          <span>${v.seats} seats</span>
          <span>${fmtNum(v.rangeKm)} km</span>
          <span>${v.cruiseKmh} kph</span>
          <span>${v.fuelKgPerKm} kg/km</span>
        </div>
        <div class="variant-cost">${fmtMoney(v.cost)}</div>
        ${progress ? `<div class="variant-progress">${progress}</div>` : ""}
        <div class="variant-actions">
          <button class="btn primary" data-action="buy-variant" data-variant="${v.id}" ${canBuy ? "" : "disabled"}>Buy</button>
          <button class="btn" data-action="sell-variant" data-variant="${v.id}" ${canSell ? "" : "disabled"}>Sell 1</button>
        </div>
      </div>
    `;
  }

  function renderHangarPanel() {
    const fleetTotal = fleetSize();
    const nextUnlock = PLANE_DATA.PLANE_FAMILIES
      .flatMap(f => f.variants)
      .filter(v => isNextToUnlock(v))[0] || null;
    const brandsHtml = PLANE_DATA.PLANE_FAMILIES.map(f => {
      const ownedInBrand = state.planes.filter(p => {
        const v = PLANE_DATA.variantById(p.variantId);
        return v && v.brand === f.brand;
      }).length;
      const totalInBrand = f.variants.length;
      const variantsHtml = f.variants.map(renderVariantCard).join("");
      return `
        <div class="brand-section" data-brand="${f.brand}">
          <div class="brand-header" data-action="toggle-brand" data-brand="${f.brand}">
            <span class="brand-caret">▾</span>
            <span class="brand-name">${f.brand}</span>
            <span class="brand-count">${ownedInBrand} / ${totalInBrand}</span>
          </div>
          <div class="brand-variants">${variantsHtml}</div>
        </div>
      `;
    }).join("");
    return `
      <div class="panel-section">
        <p style="color:var(--text-dim); font-size:12px; margin:0 0 8px;">
          You own <strong style="color:var(--text)">${fleetTotal}</strong> aircraft across
          <strong style="color:var(--text)">${PLANE_DATA.PLANE_FAMILIES.filter(f => state.planes.some(p => PLANE_DATA.variantById(p.variantId)?.brand === f.brand)).length}</strong> brand${fleetTotal === 1 ? "" : "s"}.
        </p>
        ${nextUnlock ? `
          <div class="next-unlock-banner">
            <span style="color:var(--text-faint); font-size:10px; letter-spacing:0.1em; text-transform:uppercase;">Next unlock</span>
            <div style="color:var(--text); font-weight:700; margin-top:2px;">${nextUnlock.name}</div>
            <div style="color:var(--text-dim); font-size:11px; margin-top:2px;">${variantProgressText(nextUnlock)}</div>
          </div>
        ` : ""}
      </div>
      <div class="panel-section">
        <div class="hangar-brands">${brandsHtml}</div>
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
            const eco = routeEconomyCalc(r);
            const plane = routePlane(r);
            const variant = plane ? PLANE_DATA.variantById(plane.variantId) : null;
            const tier = variant ? variant.tier : 1;
            const code = variant ? variant.name : "?";
            const healthPct = plane ? Math.round(plane.health) : 0;
            const healthColor = plane && plane.health > 70 ? "var(--good)" : plane && plane.health > 30 ? "var(--warn)" : "var(--bad)";
            const profitClass = eco.profitPerSec > 0 ? "profit-pos" : eco.profitPerSec < 0 ? "profit-neg" : "";
            const statusText = eco.grounded ? eco.groundedReason : `${eco.loadFactor > 0.95 ? "full" : Math.round(eco.loadFactor*100) + "% load"}`;
            return `
              <div class="route-item">
                <div class="route-codes">${r.from} <span class="arrow">→</span> ${r.to}</div>
                <div class="route-meta">
                  <span class="plane-pill tier-${tier}">${code}</span>
                  <span class="route-income ${profitClass}">${eco.grounded ? "—" : fmtMoney(eco.profitPerSec) + "/s"}</span>
                </div>
                <div class="route-meta">
                  <span>${a ? a.city : ""} → ${b ? b.city : ""}</span>
                  <button class="btn danger" data-action="close-route" data-route-id="${r.id}" style="padding:3px 8px; font-size:10px;">Close</button>
                </div>
                <div class="route-meta" style="font-size:10px; color:var(--text-faint);">
                  <span>${a && b ? fmtNum(eco.km) + " km" : ""}</span>
                  <span>health <span style="color:${healthColor}">${healthPct}%</span></span>
                  <span>${statusText}</span>
                </div>
                ${!eco.grounded ? `
                <div class="route-econ" style="font-size:10px; color:var(--text-faint); margin-top:4px;">
                  rev <span style="color:var(--good)">${fmtMoney(eco.revenuePerSec)}</span> · cost <span style="color:var(--bad)">${fmtMoney(eco.costPerSec)}</span>
                  <div class="cost-bar">
                    ${Object.entries(eco.costBreakdown).map(([k,v]) => {
                      const pct = eco.costPerSec > 0 ? (v / eco.costPerSec) * 100 : 0;
                      return `<div class="cost-seg" style="width:${pct}%;" data-kind="${k}" title="${k}: ${fmtMoney(v)}/s"></div>`;
                    }).join("")}
                  </div>
                </div>
                ` : ""}
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
    const reputationPct = Math.round(state.reputation * 100);
    const gameDays = Math.floor(state.gameTimeHours / 24);
    return `
      <div class="panel-section">
        <div class="kv"><span class="k">Cash on hand</span><span class="v">${fmtMoney(state.cash)}</span></div>
        <div class="kv"><span class="k">Total earned</span><span class="v">${fmtMoney(state.totalEarned)}</span></div>
        <div class="kv"><span class="k">Profit / sec</span><span class="v ${income >= 0 ? 'profit-pos' : 'profit-neg'}">${fmtMoney(income)}</span></div>
        <div class="kv"><span class="k">Profit / min</span><span class="v">${fmtMoney(income * 60)}</span></div>
        <div class="kv"><span class="k">Profit / hr</span><span class="v">${fmtMoney(income * 3600)}</span></div>
      </div>
      <div class="panel-section">
        <h3>Reputation</h3>
        <div class="reputation-bar">
          <div class="reputation-fill" style="width:${reputationPct}%;"></div>
          <span class="reputation-label">${reputationPct}%</span>
        </div>
        <div style="color:var(--text-faint); font-size:11px; margin-top:4px;">Drifts based on profit rate. Higher = more demand.</div>
      </div>
      <div class="panel-section">
        <h3>Operations</h3>
        <div class="kv"><span class="k">Game time</span><span class="v">${gameDays}d ${Math.floor(state.gameTimeHours % 24)}h</span></div>
        <div class="kv"><span class="k">Passengers flown</span><span class="v">${Math.round(state.stats.paxCarried).toLocaleString()}</span></div>
        <div class="kv"><span class="k">Flights flown</span><span class="v">${state.stats.flightsDone.toFixed(2)}</span></div>
        <div class="kv"><span class="k">Uptime</span><span class="v">${uptimeH} h</span></div>
      </div>
      <div class="panel-section">
        <h3>Fleet</h3>
        ${PLANE_TYPES.map(p => {
          const variant = PLANE_DATA.cheapestVariantForTier(p.tier);
          const owned = planesByTier(p.tier).length;
          return `<div class="kv"><span class="k">${variant ? variant.name : p.name}</span><span class="v">${owned}</span></div>`;
        }).join("")}
      </div>
      <div class="panel-section">
        <h3>Network</h3>
        <div class="kv"><span class="k">Active routes</span><span class="v">${totalRoutes}</span></div>
        <div class="kv"><span class="k">Airports unlocked</span><span class="v">${airports.filter(isAirportUnlocked).length} / ${airports.length}</span></div>
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
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = el.getAttribute("data-action");
        if (action === "buy-variant") {
          const variantId = el.getAttribute("data-variant");
          buyPlane(variantId);
        } else if (action === "sell-variant") {
          const variantId = el.getAttribute("data-variant");
          sellPlane(variantId);
        } else if (action === "toggle-brand") {
          const brand = el.getAttribute("data-brand");
          const section = body.querySelector(`.brand-section[data-brand="${brand}"]`);
          if (!section) return;
          section.classList.toggle("collapsed");
          const caret = el.querySelector(".brand-caret");
          if (caret) caret.textContent = section.classList.contains("collapsed") ? "▸" : "▾";
        }
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
        const variant = PLANE_DATA.cheapestVariantForTier(p.tier);
        const owned = unassignedPlanesByTier(p.tier).length;
        const isSelected = pickedTier === p.tier;
        const label = variant ? variant.name : p.name;
        return `<button class="btn ${isSelected ? "primary" : ""}" data-tier="${p.tier}" ${owned > 0 ? "" : "disabled"} style="margin:3px;">${label}${owned > 0 ? ` (${owned})` : ""}</button>`;
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
        const variant = PLANE_DATA.cheapestVariantForTier(pickedTier);
        const tierBaseRate = { 1: 0.5, 2: 5, 3: 30, 4: 100 };
        const inRange = variant ? km <= variant.rangeKm : false;
        const income = inRange ? (tierBaseRate[pickedTier] || 0) * Math.max(0.2, km / 1000) : 0;
        preview.innerHTML = `
          <div class="kv"><span class="k">Distance</span><span class="v">${fmtNum(km)} km</span></div>
          <div class="kv"><span class="k">Plane</span><span class="v">${variant ? variant.name : "?"}</span></div>
          <div class="kv"><span class="k">Range</span><span class="v">${variant ? fmtNum(variant.rangeKm) : "?"} km</span></div>
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
    const badge = $("badge-events");
    if (badge) {
      const n = state.events.length;
      badge.textContent = String(n);
      badge.hidden = n === 0;
    }
    const pill = $("mode-pill");
    if (pill) {
      const cfg = modeConfig();
      pill.textContent = cfg.label;
      pill.style.color = cfg.color;
      pill.title = state.mode === "realistic"
        ? "Realistic mode: full simulation (fuel, CO2, personnel, maintenance)"
        : "Simplified mode: basic economy. Unlock Realistic at " + fmtMoney(UNLOCK_REALISTIC_AT) + " total earned.";
    }
    const resBtn = $("btn-resources");
    if (resBtn) {
      resBtn.hidden = state.mode !== "realistic";
    }
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
    const dtSec = TICK_MS / 1000;
    const dtGameHours = dtSec * ECON_DATA.ECON.gameSecondsPerGameHour;
    state.gameTimeHours += dtGameHours;
    initRealisticInventoryIfNeeded();
    updateFuelPrice(dtGameHours);
    for (const r of state.routes) simulateRoute(r, dtSec);
    applyEventTick(dtGameHours);
    applyMarketingTick(dtGameHours);
    applyReputationDrift(dtSec);
    if (state.mode === "realistic") applySalaries(dtGameHours);
    tryUnlockMediumAirports();
    tryUnlockRealisticMode();
    renderTopBar();
    if (["hangar", "stats", "routes", "events", "resources"].includes(panelMode)) renderPanel();
  }

  function bindTopBar() {
    $("btn-hangar").addEventListener("click", () => showPanel("hangar"));
    $("btn-routes").addEventListener("click", () => showPanel("routes"));
    $("btn-events").addEventListener("click", () => showPanel("events"));
    $("btn-resources").addEventListener("click", () => showPanel("resources"));
    $("btn-stats").addEventListener("click", () => showPanel("stats"));
    $("btn-save").addEventListener("click", () => { save(); toast("Game saved", "good"); });
    $("mode-pill").addEventListener("click", openModeInfoModal);
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
      window.__ifm = {
        map, state, get airports() { return airports; },
        load, migrateV1ToV2, save,
        routeEconomyCalc, simulateRoute, routeIncome, totalIncomePerSec,
        EVENT_TEMPLATES, EVENT_LABELS, EVENT_ICONS, EVENT_COLORS,
        createEvent, applyEventTick, currentFuelPrice, currentFuelMult,
        GAME_MODES, modeConfig, tryUnlockRealisticMode, openModeInfoModal,
        openRealisticModePrompt, renderTopBar,
        initRealisticInventoryIfNeeded, updateFuelPrice,
        buyFuel, buyCO2, hirePersonnel, monthlySalaries,
        doMaintenanceCheck, setSeatConfig, startMarketingCampaign,
        applyMarketingTick, realisticGroundedReason, planePersonnelRequirements,
      };
    }
  }

  boot();
})();
