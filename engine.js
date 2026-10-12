// ===== Career rules: ratings, caps, costs, contracts, earnings, prestige =====
// Pure logic (no DOM) so it can be balance-tested under Node.

import {
  MAX_RATING, BASE_RATING, START_CAP, SEASON_GAMES, COST, RATINGS, POSITIONS, ARCHETYPES,
  LEAGUES, CONTRACTS, LEGACY_RATING_BONUS, LEGACY_EARN_BONUS, TRAINING, ADS, CATEGORIES,
  NON_BOOST_CAP, CAP_BREAK_STEP, CAP_BREAK_GS36, BODY,
} from './data.js';
import { computeOverall, gaussian, clamp } from './sim.js';

export { computeOverall };

export const RATING_BY_ID = Object.fromEntries(RATINGS.map((r) => [r.id, r]));
export const ARCH_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
export const POS_BY_ID = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));

export const archetypesFor = (pos) => ARCHETYPES.filter((a) => a.pos === pos);

// ---------- Caps ----------
// Archetype-boosted ratings can reach 99. Everything else stops at NON_BOOST_CAP
// until Cap Breakers raise it.
export function archCap(archId, ratingId) {
  return ARCH_BY_ID[archId].boosts[ratingId] ? MAX_RATING : NON_BOOST_CAP;
}

export function ratingCap(state, ratingId) {
  const bonus = (state.capBonus && state.capBonus[ratingId]) || 0;
  return Math.min(MAX_RATING, archCap(state.archId, ratingId) + bonus + bodyCapBonus(state.body, ratingId, state.pos));
}

// ---------- Body type (height and weight) ----------
// Allowed height/weight range for a position
export function bodyRange(pos) {
  const r = BODY.byPos[pos] || { height: [BODY.height.min, BODY.height.max], weight: [BODY.weight.min, BODY.weight.max] };
  return { height: { min: r.height[0], max: r.height[1] }, weight: { min: r.weight[0], max: r.weight[1] } };
}

// Keep a body inside a position's allowed ranges (nearest edge wins)
export function clampBody(b, pos) {
  const n = normalizeBody(b);
  const r = bodyRange(pos);
  return {
    height: clamp(n.height, r.height.min, r.height.max),
    weight: clamp(n.weight, r.weight.min, r.weight.max),
  };
}

// Midpoint build for a position (neutral: no shifts)
export function bodyMid(pos) {
  const r = bodyRange(pos);
  return {
    height: Math.round((r.height.min + r.height.max) / 2),
    weight: Math.round((r.weight.min + r.weight.max) / 2 / 5) * 5,
  };
}

export function normalizeBody(b) {
  const height = clamp(Math.round(Number(b && b.height != null ? b.height : BODY.height.def)), BODY.height.min, BODY.height.max);
  const weight = clamp(Math.round(Number(b && b.weight != null ? b.weight : BODY.weight.def) / 5) * 5, BODY.weight.min, BODY.weight.max);
  return { height, weight };
}

// Position-relative height and weight: -1 = bottom of the position's range, +1 = top, 0 = midpoint
export function bodyUnits(b, pos) {
  const n = clampBody(b, pos);
  const r = bodyRange(pos);
  const u = (v, rr) => clamp((v - (rr.min + rr.max) / 2) / ((rr.max - rr.min) / 2), -1, 1);
  return { h: u(n.height, r.height), w: u(n.weight, r.weight) };
}

// Starting-rating shift. Full effect at the range edges (x1.5 on the base shift table).
export function bodyShift(b, ratingId, pos) {
  const u = bodyUnits(b, pos);
  return Math.round(1.5 * ((BODY.startShift.h[ratingId] || 0) * u.h + (BODY.startShift.w[ratingId] || 0) * u.w));
}

export function bodyCapBonus(b, ratingId, pos) {
  const u = bodyUnits(b, pos);
  let bonus = 0;
  for (const rule of BODY.capRules) {
    const val = rule.axis === 'h' ? u.h : u.w;
    if (rule.dir * val >= rule.at && rule.ratings.includes(ratingId)) bonus += BODY.capStep;
  }
  return bonus;
}

// Human-readable effects of a body type within a position, for the create screen
export function bodyEffects(b, pos) {
  const shifts = [], caps = [];
  for (const r of RATINGS) {
    const d = bodyShift(b, r.id, pos);
    if (d) shifts.push({ id: r.id, name: r.name, delta: d });
    const c = bodyCapBonus(b, r.id, pos);
    if (c) caps.push({ id: r.id, name: r.name, bonus: c });
  }
  return { shifts, caps };
}

// Starting ratings for an archetype, plus legacy bonus from ascensions and body type
export function startingRatings(archId, ascensions = 0, body = null) {
  const a = ARCH_BY_ID[archId];
  const b = clampBody(body || bodyMid(a.pos), a.pos);
  const out = {};
  for (const r of RATINGS) {
    let v = Math.min(BASE_RATING + (a.boosts[r.id] || 0), START_CAP);
    v += ascensions * LEGACY_RATING_BONUS + bodyShift(b, r.id, a.pos);
    out[r.id] = clamp(Math.round(v), 1, archCap(archId, r.id) + bodyCapBonus(b, r.id, a.pos));
  }
  return out;
}

// ---------- Costs ----------
// Coin cost scales with league (higher leagues grind harder, but pay far more)
export const leagueCostMult = (leagueIdx) => Math.pow(LEAGUES[leagueIdx].coinMult, COST.leagueExp);

// Cost to go from value v to v+1 for a rating, given archetype category multipliers and league.
// Core ratings cost more the heavier they weigh in Overall (weight 3 = 1.75x, weight 1 = 1.25x).
export function pointCost(ratingId, value, archId, leagueIdx = 0) {
  const a = ARCH_BY_ID[archId];
  const mult = a.cost[RATING_BY_ID[ratingId].cat] ?? 1;
  const w = POS_BY_ID[a.pos].core[ratingId] || 0;
  const corePremium = w ? 1 + COST.corePerWeight * w : 1;
  return Math.max(1, Math.ceil(COST.base * mult * corePremium * leagueCostMult(leagueIdx) * Math.pow(COST.growth, value - COST.offset)));
}

// Total cost to buy `amount` points, not going above `cap`
export function buyCost(ratingId, value, archId, amount, leagueIdx = 0, cap = MAX_RATING) {
  let total = 0, v = value, bought = 0;
  while (bought < amount && v < cap) {
    total += pointCost(ratingId, v, archId, leagueIdx);
    v++; bought++;
  }
  return { total, bought };
}

// Largest number of points affordable with `coins`, not going above `cap`
export function maxAffordable(ratingId, value, archId, coins, leagueIdx = 0, cap = MAX_RATING) {
  let total = 0, v = value, n = 0;
  while (v < cap) {
    const c = pointCost(ratingId, v, archId, leagueIdx);
    if (total + c > coins) break;
    total += c; v++; n++;
  }
  return { n, total };
}

// ---------- Contracts, minutes, pay ----------
export function contractFor(overall) {
  let idx = 0;
  CONTRACTS.forEach((c, i) => { if (overall >= c.minOvr) idx = i; });
  return { index: idx, ...CONTRACTS[idx] };
}

export function nextContract(overall) {
  const c = contractFor(overall);
  return CONTRACTS[c.index + 1] || null;
}

export function minutesFor(overall) {
  // Reserve-level players get a handful of minutes; minutes climb steeply with Overall
  return clamp(4 + (overall - 40) * 0.7, 4, 38);
}

export function perfMultiplier(gs36) {
  return clamp(0.4 + gs36 / 25, 0.4, 2.2);
}

export function legacyEarnMult(ascensions) {
  return 1 + LEGACY_EARN_BONUS * ascensions;
}

// Coins from one game
export function gameEarnings({ overall, minutes, gs36, leagueIdx, ascensions }) {
  const c = contractFor(overall);
  const league = LEAGUES[leagueIdx];
  return c.base * (minutes / 30) * perfMultiplier(gs36) * league.coinMult * legacyEarnMult(ascensions);
}

function avgRating(ratings) {
  const vals = Object.values(ratings);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Side income: a share of a typical game's pay at the current contract. Scales with league,
// contract (overall) and average rating.
function sideBase({ overall, ratings, leagueIdx }) {
  const c = contractFor(overall);
  const league = LEAGUES[leagueIdx];
  return c.base * league.coinMult * (avgRating(ratings) / 60);
}

export function trainingReward({ overall, ratings, leagueIdx, quality }) {
  return Math.round(sideBase({ overall, ratings, leagueIdx }) * TRAINING.rate * quality);
}

export function adReward({ overall, ratings, leagueIdx }) {
  return Math.round(sideBase({ overall, ratings, leagueIdx }) * ADS.rate);
}

export const emptySeason = () => ({ gp: 0, w: 0, l: 0, min: 0, gsSum: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });

export function newCareer({ name, pos, archId, body }) {
  const b = clampBody(body || bodyMid(pos), pos);
  return {
    v: 2,
    name, pos, archId,
    body: b,
    ratings: startingRatings(archId, 0, b),
    capBonus: {},
    capBreakers: 0,
    leagueIdx: 0,
    ascensions: 0,
    coins: 0,
    season: 1,
    seasonStats: emptySeason(),
    lastSeason: null,
    mvpThisLeague: 0,
    career: { games: 0, seasons: 0, mvps: 0, coinsEarned: 0, coinsSpent: 0, pts: 0, bestGs36: 0, training: 0, ads: 0, ascensions: 0, breakers: 0 },
    savedAt: Date.now(),
  };
}

export function overallOf(state) {
  return computeOverall(state.ratings, state.pos);
}

// ---------- Upgrades & cap breakers ----------
// Buy points on a rating (up to its cap). Returns number of points bought.
export function upgrade(state, ratingId, amount) {
  const cur = state.ratings[ratingId];
  const cap = ratingCap(state, ratingId);
  if (cur >= cap) return 0;
  const want = Math.min(amount, cap - cur);
  const { total, bought } = buyCost(ratingId, cur, state.archId, want, state.leagueIdx, cap);
  if (bought === 0 || total > state.coins) {
    const m = maxAffordable(ratingId, cur, state.archId, state.coins, state.leagueIdx, cap);
    if (m.n === 0) return 0;
    state.coins -= m.total;
    state.career.coinsSpent += m.total;
    state.ratings[ratingId] = cur + m.n;
    return m.n;
  }
  state.coins -= total;
  state.career.coinsSpent += total;
  state.ratings[ratingId] = cur + bought;
  return bought;
}

// Spend one Cap Breaker to raise a capped rating's cap. Returns true if it worked.
export function breakCap(state, ratingId) {
  if (state.capBreakers < 1) return false;
  if (state.ratings[ratingId] < ratingCap(state, ratingId)) return false;   // only when the rating is at its cap
  if (ratingCap(state, ratingId) >= MAX_RATING) return false;
  state.capBonus[ratingId] = (state.capBonus[ratingId] || 0) + CAP_BREAK_STEP;
  state.capBreakers -= 1;
  return true;
}

export function awardCapBreaker(state) {
  state.capBreakers += 1;
  state.career.breakers += 1;
}

// ---------- Prestige ----------
export function canAscend(state) {
  return overallOf(state) >= 99 && state.mvpThisLeague >= 1 && state.leagueIdx < LEAGUES.length - 1;
}

// Prestige: move to next league, reset ratings and caps near archetype base, reset coins.
// Unused Cap Breakers carry over.
export function ascend(state) {
  if (!canAscend(state)) return false;
  state.leagueIdx += 1;
  state.ascensions += 1;
  state.career.ascensions += 1;
  state.ratings = startingRatings(state.archId, state.ascensions, state.body);
  state.capBonus = {};
  state.coins = 0;
  state.mvpThisLeague = 0;
  state.seasonStats = emptySeason();
  state.season += 1;
  return true;
}

// ---------- Season & MVP ----------
// Expected best-of-15 rival Game Score per 36 (approx. mu + 1.74 sd), used for the MVP benchmark
export const RIVAL_SD = 2.5;
export function mvpBenchmark(leagueIdx) {
  return LEAGUES[leagueIdx].mvpMu + 1.74 * RIVAL_SD;
}

// Season end: returns { mvp: bool, playerGs36, topRival }
export function resolveSeasonMVP(state) {
  const s = state.seasonStats;
  const playerGs36 = s.min > 0 ? (s.gsSum / s.min) * 36 : 0;
  const mu = LEAGUES[state.leagueIdx].mvpMu;
  let topRival = -Infinity;
  for (let i = 0; i < 15; i++) topRival = Math.max(topRival, gaussian(mu, RIVAL_SD));
  const mvp = s.gp >= SEASON_GAMES * 0.6 && playerGs36 > topRival;
  return { mvp, playerGs36, topRival };
}

// Apply a finished game to the state. earnMult scales pay (e.g. AWAY_EARN_MULT when away). Returns earnings.
export function applyGame(state, res, earnMult = 1) {
  const ovr = overallOf(state);
  const minutes = res.box.min;
  const earn = gameEarnings({ overall: ovr, minutes, gs36: res.gs36, leagueIdx: state.leagueIdx, ascensions: state.ascensions }) * earnMult;
  state.coins += earn;
  state.career.coinsEarned += earn;
  state.career.games += 1;
  state.career.pts += res.box.pts;
  state.career.bestGs36 = Math.max(state.career.bestGs36, res.gs36);
  if (res.gs36 >= CAP_BREAK_GS36) awardCapBreaker(state);

  const s = state.seasonStats;
  s.gp += 1; if (res.won) s.w += 1; else s.l += 1;
  s.min += minutes; s.gsSum += res.gs;
  s.pts += res.box.pts; s.reb += res.box.orb + res.box.drb; s.ast += res.box.ast;
  s.stl += res.box.stl; s.blk += res.box.blk; s.tov += res.box.tov;
  s.fgm += res.box.fgm; s.fga += res.box.fga; s.tpm += res.box.tpm; s.tpa += res.box.tpa;
  return earn;
}

// Season wrap-up. Returns summary used by the UI.
export function finishSeason(state) {
  const mvpInfo = resolveSeasonMVP(state);
  if (mvpInfo.mvp) { state.mvpThisLeague += 1; state.career.mvps += 1; }
  state.career.seasons += 1;
  state.lastSeason = { season: state.season, ...state.seasonStats, mvp: mvpInfo.mvp, playerGs36: mvpInfo.playerGs36, topRival: mvpInfo.topRival, league: LEAGUES[state.leagueIdx].name, ovr: overallOf(state) };
  state.season += 1;
  state.seasonStats = emptySeason();
  return state.lastSeason;
}

export function serialize(state) { return JSON.stringify(state); }
export function deserialize(str) {
  const s = JSON.parse(str);
  if (!s || s.v !== 2) return null;
  s.capBonus = s.capBonus || {};
  s.body = clampBody(s.body, s.pos);
  s.capBreakers = s.capBreakers || 0;
  s.career.breakers = s.career.breakers || 0;
  return s;
}
export { CATEGORIES };
