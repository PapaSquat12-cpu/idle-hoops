// ===== Career rules: ratings, caps, costs, contracts, earnings, prestige =====
// Pure logic (no DOM) so it can be balance-tested under Node.

import {
  MAX_RATING, BASE_RATING, START_CAP, SEASON_GAMES, COST, RATINGS, POSITIONS, ARCHETYPES,
  LEAGUES, CONTRACTS, LEGACY_RATING_BONUS, LEGACY_EARN_BONUS, TRAINING, ADS, CATEGORIES,
  NON_BOOST_CAP, CAP_BREAK_GS36, BODY,
  coreWeights, INVEST, SIDE_RATE, CLUTCH, DAILY,
} from './data.js';
import { computeOverall, gaussian, clamp } from './sim.js';

export { computeOverall, coreWeights };

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
  const w = coreWeights(a.pos, archId)[ratingId] || 0;
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

// ---------- Side income: ads and training drills ----------
export function investLevel(state, kind) {
  return (state.invest && state.invest[kind]) || 0;
}

// Pay for a typical game at the current contract, league, and ascension
export function typicalGamePay(state) {
  const ovr = overallOf(state);
  return gameEarnings({ overall: ovr, minutes: minutesFor(ovr), gs36: 15, leagueIdx: state.leagueIdx, ascensions: state.ascensions });
}

// Cost of the next level: a number of typical games' pay, growing with (level+1)^costExp
export function investCost(state, kind) {
  const next = investLevel(state, kind) + 1;
  return Math.round(INVEST[kind].gamesBase * typicalGamePay(state) * Math.pow(next, INVEST.costExp));
}

export function buyInvest(state, kind) {
  if (!INVEST[kind]) return false;
  const cost = investCost(state, kind);
  if (state.coins < cost) return false;
  state.coins -= cost;
  state.career.coinsSpent += cost;
  state.invest = { agency: investLevel(state, 'agency'), trainer: investLevel(state, 'trainer'), idle: investLevel(state, 'idle'), [kind]: investLevel(state, kind) + 1 };
  return true;
}

// Pace for away and offline games: 0.5x at level 0, +0.02 per level, capped at 1x
export function awayPace(state) {
  const I = INVEST.idle;
  return Math.min(I.max, I.base + I.pace * investLevel(state, 'idle'));
}

// Timing divisors: gaps and cooldowns are divided by these
export function agencyDivisor(state) {
  return 1 + INVEST.agency.speed * investLevel(state, 'agency');
}
export function trainerDivisor(state) {
  return 1 + INVEST.trainer.speed * investLevel(state, 'trainer');
}

// Seconds until the next sponsor offer. Agency levels divide the gap by (1 + speed * level).
export function adGapSec(state) {
  const div = agencyDivisor(state);
  const lo = ADS.minGapSec / div, hi = ADS.maxGapSec / div;
  return lo + Math.random() * (hi - lo);
}

// Drill cooldown in seconds. Trainer levels divide it by (1 + speed * level).
export function trainingCooldownSec(state) {
  return TRAINING.cooldownSec / trainerDivisor(state);
}

function contractBase(state) {
  return contractFor(overallOf(state)).base;
}

export function adReward(state) {
  const league = LEAGUES[state.leagueIdx];
  return Math.round(contractBase(state) * SIDE_RATE.ad * league.coinMult
    * (1 + INVEST.agency.payMult * investLevel(state, 'agency')) * legacyEarnMult(state.ascensions));
}

// quality: 0.5 (sloppy) to 2 (perfect)
export function trainingReward(state, quality) {
  const league = LEAGUES[state.leagueIdx];
  return Math.round(contractBase(state) * SIDE_RATE.drill * league.coinMult
    * (1 + INVEST.trainer.payMult * investLevel(state, 'trainer')) * quality * legacyEarnMult(state.ascensions));
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
    invest: { agency: 0, trainer: 0, idle: 0 },
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
  return computeOverall(state.ratings, state.pos, state.archId);
}

// ---------- Upgrades & cap breakers ----------
// Plan a purchase of up to `amount` points without changing state.
// Points below the cap cost coins. Each point above the cap also costs one Cap Breaker,
// and that breaker raises the cap by 1.
export function planUpgrade(state, ratingId, amount) {
  let cur = state.ratings[ratingId];
  let cap = ratingCap(state, ratingId);
  let coins = state.coins, breakers = state.capBreakers;
  let n = 0, total = 0, used = 0;
  while (n < amount && cur < MAX_RATING) {
    const cost = pointCost(ratingId, cur, state.archId, state.leagueIdx);
    if (cur < cap) {
      if (coins < cost) break;
    } else {
      if (breakers < 1 || coins < cost) break;
      breakers -= 1; used += 1;
      cap = cur + 1;
    }
    coins -= cost; total += cost; cur += 1; n += 1;
  }
  return { n, total, breakers: used };
}

// Buy up to `amount` points on a rating. Returns number of points bought.
export function upgrade(state, ratingId, amount) {
  const p = planUpgrade(state, ratingId, amount);
  if (p.n === 0) return 0;
  state.coins -= p.total;
  state.career.coinsSpent += p.total;
  state.capBreakers -= p.breakers;
  state.capBonus = state.capBonus || {};
  state.capBonus[ratingId] = (state.capBonus[ratingId] || 0) + p.breakers;
  state.ratings[ratingId] += p.n;
  if (p.n > 0) recordDaily(state, 'upgrade', p.n);
  return p.n;
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

// ---------- Clutch time ----------
export function clutchReward(state) {
  const league = LEAGUES[state.leagueIdx];
  const clutch = state.ratings.clutch || 0;
  return Math.round(contractBase(state) * CLUTCH.rate * league.coinMult * (0.5 + clutch / 100) * legacyEarnMult(state.ascensions));
}

// ---------- Daily objectives (reset at local midnight) ----------
// Each objective is an uncapped ladder. Tier n must be achieved and claimed before tier n+1 starts counting.
// Count ladders (ads, drills, upgrades): n qualifying actions since the previous claim.
// Stat ladders: one game that meets the current tier's threshold.
export const COUNT_CATS = ['ads', 'drills', 'upgrades'];
export const STAT_CATS = ['pts', 'ast', 'reb', 'def', 'tpm'];

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Stat objectives an archetype gets: points for everyone, plus position and archetype specific ones
export function statCatsFor(archId) {
  const a = ARCH_BY_ID[archId];
  const b = a.boosts || {};
  const cats = ['pts'];
  if (a.pos === 'C' || a.pos === 'PF' || (b.orb || 0) >= 10 || (b.drb || 0) >= 10) cats.push('reb');
  if ((b.pass || 0) >= 12 || (b.vision || 0) >= 12) cats.push('ast');
  if ((b.three || 0) >= 12) cats.push('tpm');
  if ((b.steal || 0) >= 10 || (b.block || 0) >= 10) cats.push('def');
  return cats;
}

// Defensive objective: blocks for interior archetypes, steals for perimeter ones
export function defKind(archId) {
  const b = ARCH_BY_ID[archId].boosts || {};
  return (b.block || 0) > (b.steal || 0) ? 'block' : 'steal';
}

export function statThreshold(cat, tier) {
  const L = DAILY.statLadders[cat];
  return L[Math.min(tier - 1, L.length - 1)];
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

export function tierLabel(state, cat, n) {
  if (cat === 'ads') return `Accept ${plural(n, 'sponsor offer')}`;
  if (cat === 'drills') return `Finish ${plural(n, 'training drill')}`;
  if (cat === 'upgrades') return `Buy ${plural(n, 'rating point')}`;
  const L = DAILY.statLadders[cat];
  const t = statThreshold(cat, n);
  const rep = n > L.length ? ` (x${n - L.length + 1})` : '';
  const text = {
    pts: `Score ${t} points in a game`,
    ast: `Record ${t} assists in a game`,
    reb: `Grab ${t} rebounds in a game`,
    tpm: `Make ${t} threes in a game`,
    def: defKind(state.archId) === 'block' ? `Block ${t} shots in a game` : `Get ${t} steals in a game`,
  }[cat];
  return text + rep;
}

export function ensureDaily(state) {
  const key = dayKey();
  if (!state.daily || state.daily.day !== key || state.daily.v !== 4) {
    const per = () => ({ tier: 1, prog: 0, ready: false });
    const cats = {};
    for (const id of [...COUNT_CATS, ...STAT_CATS]) cats[id] = per();
    state.daily = { v: 4, day: key, cats, claimed: 0 };
  }
  return state.daily;
}

// Current objective per applicable category
export function dailyObjectives(state) {
  const d = ensureDaily(state);
  const ids = [...COUNT_CATS, ...statCatsFor(state.archId)];
  return ids.map((id) => {
    const c = d.cats[id];
    const isStat = STAT_CATS.includes(id);
    return { id, target: isStat ? 1 : c.tier, progress: c.prog, ready: c.ready, label: tierLabel(state, id, c.tier) };
  });
}

// Payout for the next claim: rises slightly with each claim made today
export function dailyPayout(state, claimedToday) {
  const league = LEAGUES[state.leagueIdx];
  return contractBase(state) * DAILY.rate * league.coinMult * legacyEarnMult(state.ascensions) * (1 + DAILY.step * claimedToday);
}

// Record active play. Returns the objectives that just became ready to claim: [{ id, label }].
export function recordDaily(state, event, value = 1) {
  const d = ensureDaily(state);
  const ready = [];
  const markReady = (id) => {
    const c = d.cats[id];
    c.ready = true;
    ready.push({ id, label: tierLabel(state, id, c.tier) });
  };
  const add = (id, amount) => {
    const c = d.cats[id];
    if (c.ready) return;                       // must claim before the next tier counts
    c.prog = Math.min(c.tier, c.prog + amount);
    if (c.prog >= c.tier) markReady(id);
  };
  if (event === 'ad') add('ads', 1);
  else if (event === 'drill') add('drills', 1);
  else if (event === 'upgrade') add('upgrades', value);
  else if (event === 'game') {
    const b = value.box;
    const metric = {
      pts: b.pts, ast: b.ast, reb: b.orb + b.drb, tpm: b.tpm,
      def: defKind(state.archId) === 'block' ? b.blk : b.stl,
    };
    for (const id of statCatsFor(state.archId)) {
      const c = ensureDaily(state).cats[id];
      if (!c.ready && metric[id] >= statThreshold(id, c.tier)) markReady(id);
    }
  }
  return ready;
}

// Claim a ready objective: pays now, then the next tier of that category starts counting
export function claimDaily(state, id) {
  const d = ensureDaily(state);
  const c = d.cats[id];
  if (!c || !c.ready) return 0;
  const pay = Math.round(dailyPayout(state, d.claimed));
  d.claimed += 1;
  state.coins += pay;
  state.career.coinsEarned += pay;
  c.tier += 1; c.prog = 0; c.ready = false;
  return pay;
}

export function serialize(state) { return JSON.stringify(state); }
export function deserialize(str) {
  const s = JSON.parse(str);
  if (!s || s.v !== 2) return null;
  s.capBonus = s.capBonus || {};
  s.body = clampBody(s.body, s.pos);
  s.capBreakers = s.capBreakers || 0;
  s.invest = { agency: 0, trainer: 0, idle: 0, ...(s.invest || {}) };
  s.career.breakers = s.career.breakers || 0;
  return s;
}
export { CATEGORIES };
