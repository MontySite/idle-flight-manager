(() => {
  "use strict";

  const PLANE_FAMILIES = [
    {
      brand: "Boeing",
      country: "US",
      origin: 1934,
      variants: [
        { id: "b733", tier: 1, name: "737-300",     seats: 100, fuelKgPerKm: 3.5, rangeKm: 4200,  cruiseKmh: 820, cost: 1_000_000,   unlockBy: null },
        { id: "b738", tier: 2, name: "737-800",     seats: 162, fuelKgPerKm: 3.5, rangeKm: 5400,  cruiseKmh: 840, cost: 5_000_000,   unlockBy: { prev: "b733", count: 3 } },
        { id: "b752", tier: 2, name: "757-200",     seats: 200, fuelKgPerKm: 4.5, rangeKm: 7200,  cruiseKmh: 850, cost: 8_000_000,   unlockBy: { prev: "b738", count: 5 } },
        { id: "b763", tier: 3, name: "767-300ER",   seats: 269, fuelKgPerKm: 5.5, rangeKm: 11000, cruiseKmh: 870, cost: 25_000_000,  unlockBy: { prev: "b752", count: 3 } },
        { id: "b772", tier: 3, name: "777-200ER",   seats: 314, fuelKgPerKm: 7.0, rangeKm: 14000, cruiseKmh: 905, cost: 60_000_000,  unlockBy: { prev: "b763", count: 3 } },
        { id: "b773", tier: 3, name: "777-300ER",   seats: 396, fuelKgPerKm: 8.0, rangeKm: 14000, cruiseKmh: 905, cost: 90_000_000,  unlockBy: { prev: "b772", count: 3 } },
        { id: "b788", tier: 3, name: "787-8",       seats: 242, fuelKgPerKm: 4.0, rangeKm: 13500, cruiseKmh: 910, cost: 80_000_000,  unlockBy: { prev: "b763", count: 5 } },
        { id: "b789", tier: 3, name: "787-9",       seats: 290, fuelKgPerKm: 4.5, rangeKm: 14000, cruiseKmh: 910, cost: 110_000_000, unlockBy: { prev: "b788", count: 3 } },
        { id: "b781", tier: 4, name: "787-10",      seats: 336, fuelKgPerKm: 5.0, rangeKm: 12000, cruiseKmh: 910, cost: 140_000_000, unlockBy: { prev: "b789", count: 3 } },
        { id: "b748", tier: 4, name: "747-8",       seats: 467, fuelKgPerKm: 11.0, rangeKm: 14000, cruiseKmh: 915, cost: 200_000_000, unlockBy: { prev: "b773", count: 5 } },
        { id: "b779", tier: 4, name: "777-9",       seats: 414, fuelKgPerKm: 9.0, rangeKm: 14000, cruiseKmh: 905, cost: 250_000_000, unlockBy: { prev: "b748", count: 3 } },
      ],
    },
    {
      brand: "Airbus",
      country: "EU",
      origin: 1970,
      variants: [
        { id: "a221", tier: 1, name: "A220-100",  seats: 120, fuelKgPerKm: 2.5, rangeKm: 3500,  cruiseKmh: 800, cost: 3_000_000,   unlockBy: null },
        { id: "a223", tier: 2, name: "A220-300",  seats: 130, fuelKgPerKm: 2.7, rangeKm: 3500,  cruiseKmh: 800, cost: 6_000_000,   unlockBy: { prev: "a221", count: 3 } },
        { id: "a20n", tier: 2, name: "A320neo",   seats: 180, fuelKgPerKm: 3.0, rangeKm: 6300,  cruiseKmh: 830, cost: 15_000_000,  unlockBy: { prev: "a223", count: 5 } },
        { id: "a21n", tier: 2, name: "A321neo",   seats: 220, fuelKgPerKm: 3.5, rangeKm: 5600,  cruiseKmh: 830, cost: 22_000_000,  unlockBy: { prev: "a20n", count: 3 } },
        { id: "a333", tier: 3, name: "A330-300",  seats: 290, fuelKgPerKm: 5.5, rangeKm: 11700, cruiseKmh: 870, cost: 70_000_000,  unlockBy: { prev: "a21n", count: 5 } },
        { id: "a359", tier: 3, name: "A350-900",  seats: 325, fuelKgPerKm: 5.5, rangeKm: 15000, cruiseKmh: 905, cost: 130_000_000, unlockBy: { prev: "a333", count: 3 } },
        { id: "a35k", tier: 3, name: "A350-1000", seats: 369, fuelKgPerKm: 6.0, rangeKm: 14800, cruiseKmh: 905, cost: 170_000_000, unlockBy: { prev: "a359", count: 3 } },
        { id: "a388", tier: 4, name: "A380-800",  seats: 575, fuelKgPerKm: 11.0, rangeKm: 14800, cruiseKmh: 900, cost: 230_000_000, unlockBy: { prev: "a35k", count: 5 } },
      ],
    },
    {
      brand: "Embraer",
      country: "BR",
      origin: 1969,
      variants: [
        { id: "e170", tier: 1, name: "E170",  seats: 70,  fuelKgPerKm: 1.5, rangeKm: 3800, cruiseKmh: 830, cost: 800_000,   unlockBy: null },
        { id: "e190", tier: 2, name: "E190",  seats: 100, fuelKgPerKm: 1.8, rangeKm: 4500, cruiseKmh: 830, cost: 2_500_000, unlockBy: { prev: "e170", count: 3 } },
        { id: "e195", tier: 2, name: "E195",  seats: 124, fuelKgPerKm: 2.0, rangeKm: 2600, cruiseKmh: 830, cost: 4_000_000, unlockBy: { prev: "e190", count: 3 } },
      ],
    },
    {
      brand: "Bombardier",
      country: "CA",
      origin: 1942,
      variants: [
        { id: "crj2", tier: 1, name: "CRJ-200",  seats: 50,  fuelKgPerKm: 1.5, rangeKm: 3000, cruiseKmh: 790, cost: 500_000,   unlockBy: null },
        { id: "crj7", tier: 1, name: "CRJ-700",  seats: 70,  fuelKgPerKm: 1.7, rangeKm: 3700, cruiseKmh: 800, cost: 1_200_000, unlockBy: { prev: "crj2", count: 3 } },
        { id: "crj9", tier: 2, name: "CRJ-900",  seats: 90,  fuelKgPerKm: 1.9, rangeKm: 2900, cruiseKmh: 800, cost: 2_500_000, unlockBy: { prev: "crj7", count: 3 } },
        { id: "cr1k", tier: 2, name: "CRJ-1000", seats: 104, fuelKgPerKm: 2.0, rangeKm: 2800, cruiseKmh: 800, cost: 4_000_000, unlockBy: { prev: "crj9", count: 3 } },
      ],
    },
    {
      brand: "ATR",
      country: "FR/IT",
      origin: 1981,
      variants: [
        { id: "at45", tier: 1, name: "ATR 42-500", seats: 48, fuelKgPerKm: 1.0, rangeKm: 1300, cruiseKmh: 510, cost: 400_000,   unlockBy: null },
        { id: "at76", tier: 1, name: "ATR 72-600", seats: 70, fuelKgPerKm: 1.2, rangeKm: 1500, cruiseKmh: 510, cost: 800_000,   unlockBy: { prev: "at45", count: 3 } },
      ],
    },
    {
      brand: "De Havilland",
      country: "CA",
      origin: 1928,
      variants: [
        { id: "dh81", tier: 1, name: "Dash 8-100", seats: 39, fuelKgPerKm: 1.0, rangeKm: 1900, cruiseKmh: 510, cost: 300_000,   unlockBy: null },
        { id: "dh83", tier: 1, name: "Dash 8-300", seats: 50, fuelKgPerKm: 1.1, rangeKm: 1800, cruiseKmh: 510, cost: 600_000,   unlockBy: { prev: "dh81", count: 3 } },
        { id: "dh84", tier: 2, name: "Dash 8-400", seats: 78, fuelKgPerKm: 1.3, rangeKm: 1700, cruiseKmh: 520, cost: 1_200_000, unlockBy: { prev: "dh83", count: 3 } },
      ],
    },
    {
      brand: "Cessna",
      country: "US",
      origin: 1927,
      variants: [
        { id: "c172", tier: 1, name: "172 Skyhawk",   seats: 4,  fuelKgPerKm: 0.4, rangeKm: 1200, cruiseKmh: 230, cost: 50_000,    unlockBy: null },
        { id: "c208", tier: 1, name: "208 Caravan",   seats: 14, fuelKgPerKm: 0.6, rangeKm: 1800, cruiseKmh: 340, cost: 150_000,   unlockBy: { prev: "c172", count: 3 } },
        { id: "c750", tier: 1, name: "Citation X",    seats: 12, fuelKgPerKm: 0.8, rangeKm: 6000, cruiseKmh: 850, cost: 800_000,   unlockBy: { prev: "c208", count: 3 } },
      ],
    },
    {
      brand: "McDonnell Douglas",
      country: "US",
      origin: 1967,
      variants: [
        { id: "md82", tier: 2, name: "MD-82", seats: 155, fuelKgPerKm: 4.0, rangeKm: 3800, cruiseKmh: 810, cost: 2_000_000,  unlockBy: null },
        { id: "md90", tier: 2, name: "MD-90", seats: 153, fuelKgPerKm: 4.0, rangeKm: 3200, cruiseKmh: 810, cost: 4_000_000,  unlockBy: { prev: "md82", count: 3 } },
      ],
    },
    {
      brand: "Concorde",
      country: "FR/UK",
      origin: 1969,
      variants: [
        { id: "con",  tier: 4, name: "Concorde", seats: 100, fuelKgPerKm: 14.0, rangeKm: 7200, cruiseKmh: 2150, cost: 500_000_000, unlockBy: { prev: "b772", count: 3 } },
      ],
    },
  ];

  const PLANE_VARIANTS = {};
  for (const family of PLANE_FAMILIES) {
    for (const v of family.variants) {
      PLANE_VARIANTS[v.id] = Object.freeze({ ...v, brand: family.brand, country: family.country });
    }
  }

  function variantById(id) {
    return PLANE_VARIANTS[id] || null;
  }

  function variantsByTier(tier) {
    return Object.values(PLANE_VARIANTS).filter(v => v.tier === tier);
  }

  function cheapestVariantForTier(tier) {
    return Object.values(PLANE_VARIANTS)
      .filter(v => v.tier === tier && !v.unlockBy)
      .sort((a, b) => a.cost - b.cost)[0] || null;
  }

  function ownedCount(planes, variantId) {
    let n = 0;
    for (const p of planes) if (p.variantId === variantId) n++;
    return n;
  }

  function canPurchaseVariant(variantId, planes) {
    const v = PLANE_VARIANTS[variantId];
    if (!v) return false;
    if (!v.unlockBy) return true;
    const req = v.unlockBy;
    if (req.brand) {
      const cross = planes.filter(p => {
        const pv = PLANE_VARIANTS[p.variantId];
        return pv && pv.brand === req.brand && p.variantId === req.prev;
      }).length;
      return cross >= req.count;
    }
    return ownedCount(planes, req.prev) >= req.count;
  }

  function nextUnlockedVariants(planes) {
    const out = [];
    for (const v of Object.values(PLANE_VARIANTS)) {
      if (v.unlockBy && canPurchaseVariant(v.id, planes) && !ownedCount(planes, v.id)) {
        out.push(v);
      }
    }
    return out;
  }

  const PLANE_TYPES = [
    { tier: 1, name: "Tier 1 — Regional",       blurb: "Small props and regional jets." },
    { tier: 2, name: "Tier 2 — Narrowbody",     blurb: "Domestic and short-haul workhorses." },
    { tier: 3, name: "Tier 3 — Widebody",       blurb: "Long-haul international." },
    { tier: 4, name: "Tier 4 — Jumbo",          blurb: "Flagship, high capacity." },
  ];

  function tierPlane(tier) {
    const cv = cheapestVariantForTier(tier);
    return {
      tier,
      code: cv ? cv.name : "T" + tier,
      name: PLANE_TYPES[tier - 1].name,
      cost: cv ? cv.cost : 0,
      baseRate: tier * 1.0,
      range: cv ? cv.rangeKm : 0,
      blurb: PLANE_TYPES[tier - 1].blurb,
    };
  }

  window.PLANE_DATA = {
    PLANE_FAMILIES,
    PLANE_VARIANTS,
    PLANE_TYPES,
    variantById,
    variantsByTier,
    cheapestVariantForTier,
    ownedCount,
    canPurchaseVariant,
    nextUnlockedVariants,
    tierPlane,
  };
})();
