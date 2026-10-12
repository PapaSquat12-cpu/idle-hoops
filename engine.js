// ===== Career rules: ratings, costs, contracts, earnings, prestige =====
// Pure logic (no DOM) so it can be balance-tested under Node.

import {
  MAX_RATING, BASE_RATING, START_CAP, SEASON_GAMES, COST, RATINGS, POSITIONS, ARCHETYPES,
  LEAGUES, CONTRACTS, LEGACY_RATING_BONUS, LEGACY_EARN_BONUS, TRAINING, ADS, CATEGORIES, SIDE_FLOOR,
} from './data.js';
import { computeOverall, gaussian, clamp } from './sim.js';

export { computeOverall };

export const RATING_BY_ID = Object.fromEntries(RATINGS.map((r) => [r.id, r]));
export const ARCH_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
export const POS_BY_ID = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));

export const archetypesFor = (pos) => ARCHETYPES.filter((a) => a.pos === pos);

// Starting ratings for an archetype, plus legacy bonus from ascensions
export function startingRatings(archId, ascensions = 0) {
  const a = ARCH_BY_ID[archId];
  const out = {};
  for (const r of RATINGS) {
    let v = Math.min(BASE_RATING + (a.boosts[r.id] || 0), START_CAP);
    v += ascensions * LEGACY_RATING_BONUS;
    out[r.id] = Math.min(MAX_RATING, v);
  }
  return out;
}

// Coin cost scales with league (higher leagues grind harder, but pay far more)
export const leagueCostMult = (leagueIdx) => Math.pow(LEAGUES[leagueIdx].coinMult, COST.leagueExp);

// Cost to go from value v to v+1 for a rating, given archetype category multipliers and league
export function pointCost(ratingId, value, archId, leagueIdx = 0) {
  const a = ARCH_BY_ID[archId];
  const mult = a.cost[RATING_BY_ID[ratingId].cat] ?? 1;
  // Ratings that make up Overall for this archetype's position cost more
  const corePremium = POS_BY_ID[a.pos].core[ratingId] ? COST.corePremium : 1;
  return Math.max(1, Math.ceil(COST.base * mult * corePremium * leagueCostMult(leagueIdx) * Math.pow(COST.growth, value - COST.offset)));
}

// Total cost to buy `amount` points (capped at MAX_RATING)
export function buyCost(ratingId, value, archId, amount, leagueIdx = 0) {
  let total = 0, v = value, bought = 0;
  while (bought < amount && v < MAX_RATING) {
    total += pointCost(ratingId, v, archId, leagueIdx);
    v++; bought++;
  }
  return { total, bought };
}

// Largest number of points affordable with `coins`
export function maxAffordable(ratingId, value, archId, coins, leagueIdx = 0) {
  let total = 0, v = value, n = 0;
  while (v < MAX_RATING) {
    const c = pointCost(ratingId, v, archId, leagueIdx);
    if (total + c > coins) break;
    total += c; v++; n++;
  }
  return { n, total };
}

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

export function trainingReward({ overall, ratings, leagueIdx, quality }) {
  const league = LEAGUES[leagueIdx];
  const base = TRAINING.baseCoins + Math.max(0, overall - SIDE_FLOOR) * TRAINING.perOvr + Math.max(0, avgRating(ratings) - SIDE_FLOOR) * TRAINING.perAvg;
  return Math.round(base * Math.pow(league.coinMult, 0.6) * quality);
}

export function adReward({ overall, ratings, leagueIdx }) {
  const league = LEAGUES[leagueIdx];
  const base = Math.max(0, overall - SIDE_FLOOR) * ADS.perOvr + Math.max(0, avgRating(ratings) - SIDE_FLOOR) * ADS.perAvg;
  return Math.round(base * Math.pow(league.coinMult, 0.6));
}

export const emptySeason = () => ({ gp: 0, w: 0, l: 0, min: 0, gsSum: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });

export function newCareer({ name, pos, archId }) {
  return {
    v: 2,
    name, pos, archId,
    ratings: startingRatings(archId, 0),
    leagueIdx: 0,
    ascensions: 0,
    coins: 0,
    season: 1,
    seasonStats: emptySeason(),
    lastSeason: null,
    mvpThisLeague: 0,
    career: { games: 0, seasons: 0, mvps: 0, coinsEarned: 0, coinsSpent: 0, pts: 0, bestGs36: 0, training: 0, ads: 0, ascensions: 0 },
    savedAt: Date.now(),
  };
}

export function overallOf(state) {
  return computeOverall(state.ratings, state.pos);
}

export function canUpgrade(state, ratingId) {
  return state.ratings[ratingId] < MAX_RATING;
}

// Buy points on a rating. Returns number of points bought.
export function upgrade(state, ratingId, amount) {
  const cur = state.ratings[ratingId];
  const want = Math.min(amount, MAX_RATING - cur);
  const { total, bought } = buyCost(ratingId, cur, state.archId, want, state.leagueIdx);
  if (bought === 0 || total > state.coins) {
    // buy as many as possible
    const m = maxAffordable(ratingId, cur, state.archId, state.coins, state.leagueIdx);
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

export function canAscend(state) {
  return overallOf(state) >= 99 && state.mvpThisLeague >= 1 && state.leagueIdx < LEAGUES.length - 1;
}

// Prestige: move to next league, reset ratings near archetype base, reset coins
export function ascend(state) {
  if (!canAscend(state)) return false;
  state.leagueIdx += 1;
  state.ascensions += 1;
  state.career.ascensions += 1;
  state.ratings = startingRatings(state.archId, state.ascensions);
  state.coins = 0;
  state.mvpThisLeague = 0;
  state.seasonStats = emptySeason();
  state.season += 1;
  return true;
}

// Expected best-of-15 rival Game Score per 36 (approx. mu + 1.74 sd), used for the MVP benchmark
export function mvpBenchmark(leagueIdx) {
  return LEAGUES[leagueIdx].mvpMu + 1.74 * RIVAL_SD;
}
export const RIVAL_SD = 2.5;

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

// Apply a finished game to the state. Returns earnings.
export function applyGame(state, res) {
  const ovr = overallOf(state);
  const minutes = res.box.min;
  const earn = gameEarnings({ overall: ovr, minutes, gs36: res.gs36, leagueIdx: state.leagueIdx, ascensions: state.ascensions });
  state.coins += earn;
  state.career.coinsEarned += earn;
  state.career.games += 1;
  state.career.pts += res.box.pts;
  state.career.bestGs36 = Math.max(state.career.bestGs36, res.gs36);

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
  return s;
}
export { CATEGORIES };
