# Piano: Idle Flight Manager v2 — "1000x complesso, aviation-only"

> Stato: completo
> Data: 2026-06-14
> Round totali: 4

## Sintesi

Evoluzione dell'attuale Idle Flight Manager (browser, Flask + Leaflet) in un gestionale aeronautico "serio" ispirato a WWR (brand/tier) e Airline Manager (sistemi realistici). MVP = riqualificazione del core loop con 6 sistemi interagenti (domanda × costi × aging × eventi × reputazione × hub), brand/tier system con 9 famiglie reali e ~30 varianti, e un layer "realistic mode" sbloccabile che aggiunge fuel market, CO2, personale, manutenzione schedulata, seat config e marketing. Target: profondità ≥100x, con architettura pronta per 1000x aggiungendo alleanze e multi-company in fasi successive. Nessun cambio di stack (Flask + vanilla JS + Leaflet + localStorage), refactor incrementale.

## Vincoli

- **Tempo**: nessuno (side project personale)
- **Tecnologie**: Python Flask (backend), vanilla JS + Leaflet 1.9.4 (frontend), CSS custom, localStorage (salvataggi). Vincolante per continuità con il codice esistente
- **Risorse**: 1 sviluppatore full-stack, competente in Python e JS base
- **Altri**: nessun hosting di produzione previsto (locale), nessun auth, nessun multiplayer. I dati aeroporti vengono da OurAirports (CC0, già integrato)

## Q&A

### Q1: Aviation-only deep o multi-modale broad (tipo WWR completo)?
- **Risposta utente**: A — aviation-only deep
- **Raccomandazione LLM**: A (per identità di prodotto, profondità reale, fan aviation)
- **Accettata**: sì

### Q2: Definizione di MVP "1000x più complesso"?
- **Risposta utente**: "core loop riqualificato" — 5+ numeri che interagiscono su ogni rotta
- **Raccomandazione LLM**: 6 sistemi (domanda, costi operativi, aging, eventi, reputazione, hub)
- **Accettata**: sì

### Q3: Aggiungere brand/tier (WWR) + features Airline Manager (CO2, personale, fuel market, seat config, marketing, alleanze)?
- **Risposta utente**: sì, integra tutto
- **Raccomandazione LLM**: sì, in due layer: brand/tier sempre attivo, AM-features gated da "realistic mode"
- **Accettata**: sì

### Q4: Come gestire simplified vs realistic mode?
- **Risposta utente**: non risposto esplicitamente
- **Raccomandazione LLM**: B — sblocco graduale (simplified default, realistic sbloccato a $5M totalEarned, una sola direzione)
- **Accettata**: assunto come B (se l'utente vuole cambiare, lo segnala in coda)

## Decisioni chiave

| Decisione | Scelta | Trade-off |
|-----------|--------|-----------|
| Scope di gioco | Aviation-only deep | Identità vs varietà multi-modale |
| Stack tecnico | Flask + vanilla JS + Leaflet, no build step | Continuità + semplicità > modern framework |
| Plane progression | Brand/tier WWR-style (9 brand, ~30 varianti reali) | Profondità + commitment > lista piatta di aerei |
| Mode toggle | Simplified default, realistic sbloccato a $5M | Accessibilità nuovi + obiettivo mid-game |
| Realismo economico | Costi operativi completi in entrambi i modi (fuel, crew, maint, ins, landing) | Complessità upfront > approssimazione |
| Persistenza | localStorage (no backend auth) | Semplicità > multi-device |
| Save migration | `ifm.save.v2` con fallback `.v1` | Backward compat > clean slate |

## Piano step-by-step

### Fase 1: Refactor data model (fondamenta)
1. **Estrarre plane families/variants in `frontend/data/planes.js`** — file separato con 9 brand × 30 varianti, campi `{id, brand, tier, name, seats, fuelKgPerKm, rangeKm, cruiseKmh, cost, unlockBy}` — Validazione: console log conta varianti per brand — Stima: M — Dipendenze: nessuna
2. **Aggiornare `state` shape** — `state.fleet` diventa `state.planes[]` di istanze con `{id, variantId, ageHours, health, seatConfig}`, `state.unlocks` mappa per brand, `state.cash` invariato — Validazione: load/save roundtrip OK — Stima: M — Dipendenze: task 1
3. **Migrazione save v1 → v2** — in `load()` rileva versione, applica migration (planes mancanti = 0, planes esistenti convertiti in istanze con variantId=tier) — Validazione: test su un save v1 reale — Stima: S — Dipendenze: task 2
4. **Backend airports: aggiungere `small_airport` (30k+ voci)** — estendere `fetch_data.py` con `small_airport` e gestire dataset più grande in cache — Validazione: `/api/airports` ritorna 30k+ record — Stima: S — Dipendenze: nessuna

### Fase 2: Brand/tier system + Hangar UI
1. **Funzione `canPurchase(variantId)`** — controlla `unlockBy` (owned count del prev) — Validazione: unit test su varianti locked/unlocked — Stima: S — Dipendenze: F1.t1
2. **Purchase flow aggiornato** — `buyPlane(variantId)` decrementa cash, aggiunge istanza, ri-controlla unlock di varianti dipendenti — Validazione: flusso completo in Playwright — Stima: S — Dipendenze: F1.t2, F2.t1
3. **Hangar panel ridisegnato** — vista a brand (collapse/expand), ogni brand mostra varianti in ordine, locked variants con "X/Y owned" progress, unlocked con prezzo e buy — Validazione: screenshot review — Stima: M — Dipendenze: F2.t2
4. **Dettaglio variante** (tooltip/popup) — mostra seats, range, fuel/km, cruise speed, CO2/h, unlock requirement — Validazione: visivamente leggibile — Stima: S — Dipendenze: F2.t3

### Fase 3: Core loop riqualificato
1. **Modulo `econ.js` con costanti** — estrarre `ECON`, `PLANE_FAMILIES`, `AIRPORT_PROFILE` in `frontend/data/econ.js` — Validazione: import ok — Stima: S — Dipendenze: F1
2. **`computeBaseDemand(a, b, km)`** — pop × distance curve × wealth × regional — Validazione: valori di test NYC-LDN, BOS-ALB come da spec — Stima: S — Dipendenze: F3.t1
3. **`computeSeasonality(gameTime)`** — sinusoidi annual/weekly/daily + jitter — Validazione: plot valori in 24h, vario tra 0.4 e 1.4 — Stima: S — Dipendenze: F3.t1
4. **`simulateRoute(r, dtSec)` refactor completo** — sostituisce la logica attuale con algoritmo §2 del piano (frequency, demand, capacity, revenue, costs, profit) — Validazione: simulazione 10 min reali, controllo cash coerente — Stima: L — Dipendenze: F3.t2, F3.t3
5. **Operating costs aggregati nel tick** — fuel + nav + crew + maint + ins + landing fees, tutti visibili nel route panel — Validazione: route in perdita su BOS-ALB con C172, in profitto con ATR 72 — Stima: M — Dipendenze: F3.t4
6. **Aging & health** — `wearPerFlight * flights/sec * dt`, health < 30 → grounded, line maintenance sempre disponibile — Validazione: dopo 100 voli health scende come da formula — Stima: M — Dipendenze: F3.t4
7. **Reputation** — drift basato su profit rate totale, moltiplicatore demand [0.5, 1.0] — Validazione: profit costante = rep cresce lentamente verso 1.0 — Stima: S — Dipendenze: F3.t4
8. **Hub & spoke bonus + congestion** — `+30%` demand se uno dei due endpoint è hub (≥3 routes), `+0.5h turnaround` per ogni 10 routes extra — Validazione: scenario con 5 routes da JFK aumenta domanda — Stima: M — Dipendenze: F3.t4

### Fase 4: Eventi dinamici
1. **`EVENT_TEMPLATES` con 6+ tipi** — storm, strike, oil_shock, pandemic, festival, security_alert — Validazione: lista visibile in pannello events — Stima: S — Dipendenze: F3
2. **Event lifecycle** — spawn probabilistico (`eventTickChancePerSec`), applicazione effetti su demand/fuel, decay temporale, rimozione automatica — Validazione: oil shock impatta fuel price per 30 giorni, storm riduce domanda rotte colpite per 18h — Stima: M — Dipendenze: F4.t1
3. **Events panel** — lista eventi attivi con timer, regione, impatto, e azioni (per "strike" possibilità di negoziare, costo reputazione) — Validazione: UX review — Stima: M — Dipendenze: F4.t2

### Fase 5: Game time + simplified/realistic mode toggle
1. **`state.gameTimeHours` interno** — 1 sec reali = 1 ora di gioco (configurabile), `tick()` aggiorna e chiama computeSeasonality — Validazione: dopo 24 sec reali, gameTime avanza di 24h — Stima: S — Dipendenze: F3.t3
2. **Mode flag in state** — `state.mode = "simplified" | "realistic"`, default `simplified` — Validazione: ispezione state iniziale — Stima: S — Dipendenze: nessuna
3. **Unlock realistic mode** — toast a $5M totalEarned, scelta irreversibile, switch di `state.mode` — Validazione: dopo $5M, modal switch disponibile — Stima: S — Dipendenze: F3 (revenue tale da raggiungere $5M)
4. **`GAME_MODES` config** — funzione helper `modeConfig()` che ritorna features enabled per mode corrente — Validazione: simplified = no fuel inventory, realistic = sì — Stima: S — Dipendenze: F5.t2

### Fase 6: Realistic mode — sistemi
1. **Fuel market** — `state.fuelPriceUsdPerKg` oscilla, `state.fuelInventoryKg` inventory, funzione `buyFuel(kg)` con prezzo corrente, hedging forward — Validazione: scenario buy-low sell-high visibile in UI — Stima: M — Dipendenze: F5.t4
2. **CO2 emissions + trading** — emissione `fuelKg * 3.16`, `state.co2InventoryTonnes`, mercato, grounded se esaurito — Validazione: A380 JFK-LHR consuma 60t CO2/volo come da spec — Stima: M — Dipendenze: F6.t1
3. **Personnel** — `state.personnel.{pilots, cabinCrew, groundCrew}`, hiring istantaneo con salary mensile passive, check pre-flight — Validazione: senza piloti la rotta è grounded, salary visibile nei costi — Stima: M — Dipendenze: F5.t4
4. **Maintenance scheduling (A-check / C-check)** — timer su flight hours, obbligatorietà C-check, downtime ore, line maintenance per health restore — Validazione: A380 dopo 500h obbliga A-check — Stima: M — Dipendenze: F6.t3
5. **Seat config (econ/biz/first mix)** — per istanza plane, tariffe moltiplicate 1×/2.5×/5×, UI con slider percentages — Validazione: stessa rotta con first 20% ha revenue/pax più alto — Stima: M — Dipendenze: F5.t4
6. **Marketing campaigns** — `state.campaigns[]` con region/duration/cost, applicazione multiplicatore su domanda — Validazione: "EU campaign" +20% demand su rotte EU per 72h — Stima: M — Dipendenze: F3.t2

### Fase 7: Airport expansion (4000+ target)
1. **Unlock `small_airport` tier** — nuovo milestone a $1M totalEarned, `state.smallAirportsUnlocked = false` di default — Validazione: gated finché non sbloccato — Stima: S — Dipendenze: F1.t4
2. **`isAirportUnlocked` aggiornato** — include small tier condizionale — Validazione: small airports visibili solo post-unlock — Stima: S — Dipendenze: F7.t1
3. **`airportBySize` map** nel data fetcher — `large` / `medium` / `small` per badge color — Validazione: visualizzato in airport panel — Stima: S — Dipendenze: F1.t4

### Fase 8: Alliances (late game)
1. **3 alliances simulate** — `state.alliance` null di default, sbloccato a $50M totalEarned — Validazione: gated da milestone — Stima: S — Dipendenze: F6
2. **Alliance perks** — codeshare routes (30% revenue), priority slots, 5% fuel discount, reputation bonus — Validazione: route codeshare genera revenue anche senza piano assegnato — Stima: L — Dipendenze: F8.t1
3. **Alliance UI** — pannello con bonus attivi, fee annuale, possibilità di uscire (con penale) — Validazione: UX review — Stima: M — Dipendenze: F8.t2

### Fase 9: UI/UX polish
1. **Route profitability dashboard** — tabella con tutte le rotte: revenue, costs, profit, load factor, demand, health of plane — Validazione: ordinamento per profit discendente — Stima: M — Dipendenze: F3, F4
2. **Brand comparison view** — confronto side-by-side di varianti dello stesso brand — Validazione: visivamente chiaro — Stima: S — Dipendenze: F2
3. **Maintenance calendar** — vista temporale con A/C check in scadenza — Validazione: A380 con 450h mostra "A-check tra 50h" — Stima: M — Dipendenze: F6.t4
4. **Tutorial/onboarding** — guided tour dei primi 5 minuti di gioco (compra C172, apri rotta, sblocca medium, compra ATR, ...) — Validazione: nuovo giocatore completa il tutorial — Stima: M — Dipendenze: F3, F4

### Fase 10: Balance + test + docs
1. **Balance pass** — playthrough completo end-to-end in simplified (1h reale), poi realistic (3h reali), tuning di costanti che non matchano i target di progressione — Validazione: bootstrap <10 min, $1M in <2h, $1B endgame possibile — Stima: L — Dipendenze: F1-F9
2. **Playwright test suite** — copertura per: purchase plane, create route, simulate 1h gioco, eventi, hub bonus, mode switch, CO2 grounding, personnel grounding, save/load roundtrip, migration v1→v2 — Validazione: CI green — Stima: L — Dipendenze: F1-F9
3. **Player guide (PLAYER.md)** — overview dei sistemi, glossario (slot, codeshare, A-check), tips strategiche per brand choice e hub placement — Validazione: leggibile da utente nuovo — Stima: M — Dipendenze: F10.t1
4. **Scrivere PLAN.md** — documento di design completo con questo piano, l'algoritmo §2, le costanti, le formule di balance — Validazione: file committato — Stima: S — Dipendenze: F10.t1

## Rischi e fallback

| Rischio | Probabilità | Impatto | Fallback |
|---------|-------------|---------|----------|
| OurAirports cambia schema CSV | bassa | medio | cache locale di 30 giorni, parsing tollerante (skip colonne mancanti) |
| 30k small airports pesano sul client | media | medio | filtro viewport (già attivo), caricamento lazy via tile-rich (in futuro) |
| localStorage supera 5MB con tante rotte | bassa | alto | migrazione a IndexedDB, o compattazione save (rimozione routes chiuse) |
| Realistic mode così complesso da scoraggiare | media | alto | tooltip esaustivi, default ragionevoli, "auto-buy fuel" opzionale |
| Bootstrap troppo lento (player non vede progressi in 30 min) | media | alto | tuning aggressivo early-game: starter pack di cash o primo aereo gratis |
| Bootstrap troppo veloce (boring endgame) | bassa | medio | scaling esponenziale costi late-game, prestige reset opzionale in futuro |
| Save corruption durante evento realtime | bassa | alto | autosave ogni 5s (più frequente), backup versione N-1 |
| Plane unlock "a catena" crea grinding | media | medio | alternativa "cash unlock" ($X) per saltare il gating se hai i soldi |
| Balance: rotte regionali non profittevoli | media | medio | tuning `landingFeeUsdPerPax` e `crewUsdPerHour` per tier, in F10 |
| Performance: 30+ sistemi in tick 1Hz = jank | bassa | medio | pre-calcolo costanti per route, dirty flag, profiling con `performance.now()` |

## Todo

- [ ] F1.t1 — Estrarre plane families/variants in `frontend/data/planes.js`
- [ ] F1.t2 — Aggiornare `state` shape con `planes[]`, `unlocks`, `seatConfig`
- [ ] F1.t3 — Migrazione save v1 → v2
- [ ] F1.t4 — Backend: aggiungere `small_airport` al dataset
- [ ] F2.t1 — Funzione `canPurchase(variantId)` con unlock logic
- [ ] F2.t2 — Purchase flow aggiornato
- [ ] F2.t3 — Hangar panel ridisegnato (vista brand)
- [ ] F2.t4 — Dettaglio variante (tooltip)
- [ ] F3.t1 — Modulo `econ.js` con costanti
- [ ] F3.t2 — `computeBaseDemand`
- [ ] F3.t3 — `computeSeasonality` con game time
- [ ] F3.t4 — `simulateRoute` refactor completo
- [ ] F3.t5 — Operating costs aggregati + UI
- [ ] F3.t6 — Aging & health
- [ ] F3.t7 — Reputation
- [ ] F3.t8 — Hub & spoke bonus + congestion
- [ ] F4.t1 — `EVENT_TEMPLATES` con 6+ tipi
- [ ] F4.t2 — Event lifecycle (spawn, decay, applicazione)
- [ ] F4.t3 — Events panel
- [ ] F5.t1 — `state.gameTimeHours` interno
- [ ] F5.t2 — Mode flag in state
- [ ] F5.t3 — Unlock realistic mode a $5M
- [ ] F5.t4 — `GAME_MODES` config helper
- [ ] F6.t1 — Fuel market + inventory + hedging
- [ ] F6.t2 — CO2 emissions + trading
- [ ] F6.t3 — Personnel (pilots, cabin crew, ground crew)
- [ ] F6.t4 — Maintenance scheduling (A-check / C-check)
- [ ] F6.t5 — Seat config (econ/biz/first mix)
- [ ] F6.t6 — Marketing campaigns
- [ ] F7.t1 — Unlock `small_airport` tier a $1M
- [ ] F7.t2 — `isAirportUnlocked` aggiornato
- [ ] F7.t3 — `airportBySize` map e badge
- [ ] F8.t1 — 3 alliances simulate (unlock a $50M)
- [ ] F8.t2 — Alliance perks (codeshare, slots, fuel discount)
- [ ] F8.t3 — Alliance UI
- [ ] F9.t1 — Route profitability dashboard
- [ ] F9.t2 — Brand comparison view
- [ ] F9.t3 — Maintenance calendar
- [ ] F9.t4 — Tutorial/onboarding
- [ ] F10.t1 — Balance pass end-to-end
- [ ] F10.t2 — Playwright test suite
- [ ] F10.t3 — Player guide (PLAYER.md)
- [ ] F10.t4 — Scrivere PLAN.md (questo file)

## Da riprendere (se l'utente cambia idea)

- Se l'utente vuole A o C invece di B per il mode toggle, riconciliare F5.t3
- Se l'utente vuole più brand (es. Sukhoi, Comac, Mitsubishi SpaceJet), aggiungere a PLANE_FAMILIES
- Se l'utente vuole cargo in MVP, riconciliare out-of-scope e aggiungere task
