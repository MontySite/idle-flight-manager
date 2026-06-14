(() => {
  "use strict";

  const ECON = {
    fuelPriceUsdPerKg: 0.80,
    navFeeUsdPerKm: 0.005,
    insuranceUsdPerHour: { 1: 30, 2: 200, 3: 400, 4: 800 },
    landingFeeUsdPerPax: { large: 1.5, medium: 0.5, small: 0.2 },
    crewUsdPerHour: { 1: 50, 2: 200, 3: 800, 4: 2000 },
    maintenanceUsdPerHour: { 1: 30, 2: 300, 3: 500, 4: 1500 },
    fareUsdPerPaxPerKm: 0.15,
    hubConnectivityBonus: 0.30,
    hubRoutesThreshold: 3,
    hubCongestionRoutes: 10,
    hubCongestionPenaltyHours: 0.5,
    wearPerFlightByTier: { 1: 0.05, 2: 0.20, 3: 0.50, 4: 0.80 },
    minEfficiencyHealth: 0.50,
    groundBelowHealth: 30,
    gameSecondsPerGameHour: 1,
    reputationMin: 0.5,
    reputationMax: 1.0,
    reputationStart: 1.0,
    reputationDrift: 0.0001,
    minDistanceKmForDemand: 0,
  };

  const AIRPORT_PROFILE = {
    population: { large_airport: 8, medium_airport: 1.5, small_airport: 0.3 },
    wealth: { large_airport: 1.3, medium_airport: 1.0, small_airport: 0.8 },
    slotPenaltyHours: { large_airport: 0.5, medium_airport: 0, small_airport: 0 },
  };

  function airportSize(ap) {
    if (!ap) return "medium_airport";
    return ap.type || "medium_airport";
  }

  function popOf(ap) {
    return AIRPORT_PROFILE.population[airportSize(ap)] || 1.0;
  }

  function wealthOf(ap) {
    return AIRPORT_PROFILE.wealth[airportSize(ap)] || 1.0;
  }

  function slotPenaltyHoursOf(ap) {
    return AIRPORT_PROFILE.slotPenaltyHours[airportSize(ap)] || 0;
  }

  function landingFeePerPaxOf(ap) {
    const size = airportSize(ap);
    if (size === "large_airport") return ECON.landingFeeUsdPerPax.large;
    if (size === "small_airport") return ECON.landingFeeUsdPerPax.small;
    return ECON.landingFeeUsdPerPax.medium;
  }

  const REGION_GROUPS = [
    { code: "EU", countries: ["DE","FR","GB","UK","IT","ES","NL","BE","AT","CH","PT","IE","DK","SE","NO","FI","PL","CZ","SK","HU","RO","BG","GR","HR","SI","RS","BA","MK","AL","ME","XK","LT","LV","EE","IS","LU","MT","CY","MD","UA","BY","GI"] },
    { code: "NA", countries: ["US","CA","MX","GL","PM"] },
    { code: "AS", countries: ["JP","CN","KR","KP","IN","ID","TH","VN","MY","SG","PH","MM","KH","LA","BN","TW","HK","MO","MN","KZ","UZ","TM","KG","TJ","AF","PK","BD","NP","BT","LK","MV","SA","AE","OM","QA","BH","KW","IQ","IR","YE","JO","IL","LB","SY","TR","AM","AZ","GE"] },
    { code: "SA", countries: ["BR","AR","CL","PE","CO","VE","EC","BO","UY","PY","GY","SR","GF","FK"] },
    { code: "AF", countries: ["ZA","EG","NG","KE","ET","TZ","UG","GH","CI","SN","MA","DZ","TN","LY","SD","ZW","ZM","AO","MZ","MG","MU","RE","SC","CV","AO","SO","ML","BF","NE","TD","CM","CD","CG"] },
    { code: "OC", countries: ["AU","NZ","PG","FJ","NC","SB","VU","WS","TO","KI","FM","PW","MH","NR","TV","CK","NU","TK","WF"] },
  ];

  const countryRegion = {};
  for (const r of REGION_GROUPS) {
    for (const c of r.countries) countryRegion[c] = r.code;
  }

  function sameRegion(a, b) {
    if (!a || !b) return false;
    const ra = countryRegion[a] || null;
    const rb = countryRegion[b] || null;
    return ra && rb && ra === rb;
  }

  function distanceDemandFactor(km) {
    if (km < 300) return 0.4;
    if (km < 2500) return 1.0;
    if (km < 8000) return 0.85;
    return 0.55;
  }

  function computeBaseDemand(a, b, km) {
    if (!a || !b) return 0;
    const popA = popOf(a);
    const popB = popOf(b);
    const popFactor = Math.sqrt(popA * popB) * 50;
    const distFactor = distanceDemandFactor(km);
    const wealthFactor = (wealthOf(a) + wealthOf(b)) / 2;
    const regional = sameRegion(a.country, b.country) ? 1.25 : 1.0;
    return popFactor * distFactor * wealthFactor * regional;
  }

  function computeSeasonality(gameTimeHours) {
    const t = gameTimeHours || 0;
    const yearPhase = (t / (24 * 365)) * 2 * Math.PI;
    const weekPhase = (t / (24 * 7)) * 2 * Math.PI;
    const dayPhase = (t / 24) * 2 * Math.PI;
    const noise = (Math.random() - 0.5) * 0.05;
    const annual = 1 + 0.15 * Math.sin(yearPhase - Math.PI / 2);
    const weekly = 1 + 0.08 * Math.sin(weekPhase);
    const daily = 1 + 0.10 * Math.sin(dayPhase - 2);
    return Math.max(0.4, annual * weekly * daily + noise);
  }

  function priceElasticity(pricePerKm) {
    const ratio = pricePerKm / ECON.fareUsdPerPaxPerKm;
    return 1.0 / (1.0 + Math.exp(2.5 * (ratio - 1.0))) * 1.7 + 0.35;
  }

  function applyEventsToRoute(route, a, b, events) {
    let mult = 1;
    for (const e of (events || [])) {
      if (e.appliesTo === "global") mult *= e.demandMult ?? 1;
      else if (e.appliesTo === "region" && (countryRegion[a.country] === e.region || countryRegion[b.country] === e.region)) mult *= e.demandMult ?? 1;
      else if (e.appliesTo === "airport" && (a.id === e.airportId || b.id === e.airportId)) mult *= e.demandMult ?? 1;
    }
    return mult;
  }

  function routesAtAirport(airportId, routes) {
    let n = 0;
    for (const r of (routes || [])) {
      if (r.from === airportId || r.to === airportId) n++;
    }
    return n;
  }

  function isHub(airportId, routes) {
    return routesAtAirport(airportId, routes) >= ECON.hubRoutesThreshold;
  }

  function computeHubBonus(a, b, routes) {
    if (isHub(a.id, routes) || isHub(b.id, routes)) return ECON.hubConnectivityBonus;
    return 0;
  }

  function hubCongestionPenaltyHours(ap, routes) {
    const n = routesAtAirport(ap.id, routes);
    if (n <= ECON.hubCongestionRoutes) return 0;
    return Math.floor((n - ECON.hubCongestionRoutes) / 10) * ECON.hubCongestionPenaltyHours;
  }

  function cycleHours(km, variant, origin, dest, routes) {
    const flightHours = km / variant.cruiseKmh;
    const turnaroundHours = 2 + slotPenaltyHoursOf(origin) + slotPenaltyHoursOf(dest)
                          + hubCongestionPenaltyHours(origin, routes)
                          + hubCongestionPenaltyHours(dest, routes);
    return flightHours + turnaroundHours;
  }

  function efficiency(plane) {
    return Math.max(ECON.minEfficiencyHealth, (plane?.health ?? 100) / 100);
  }

  function isGrounded(plane) {
    if (!plane) return true;
    return plane.health < ECON.groundBelowHealth;
  }

  function clampReputation(r) {
    return Math.max(ECON.reputationMin, Math.min(ECON.reputationMax, r));
  }

  window.ECON_DATA = {
    ECON,
    AIRPORT_PROFILE,
    REGION_GROUPS,
    countryRegion,
    airportSize,
    popOf,
    wealthOf,
    slotPenaltyHoursOf,
    landingFeePerPaxOf,
    sameRegion,
    distanceDemandFactor,
    computeBaseDemand,
    computeSeasonality,
    priceElasticity,
    applyEventsToRoute,
    routesAtAirport,
    isHub,
    computeHubBonus,
    hubCongestionPenaltyHours,
    cycleHours,
    efficiency,
    isGrounded,
    clampReputation,
  };
})();
