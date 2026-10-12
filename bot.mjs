// Balance bot: plays careers with a simple "spend on best core rating" strategy.
import { ARCHETYPES, POSITIONS, RATINGS, LEAGUES, SEASON_GAMES } from '../src/data.js';
import { simulateGame } from '../src/sim.js';
import * as E from '../src/engine.js';

const runs = Number(process.argv[2] || 3);
const cap = 200000;

function spend(state) {
  // Core ratings weigh 1 and make up Overall; non-core ratings are bought at lower priority (0.4)
  const core = Object.fromEntries(RATINGS.map((r) => [r.id, E.POS_BY_ID[state.pos].core[r.id] ?? 0.4]));
  // Pick best value (weight / cost) among core ratings still below max
  let best = null;
  for (const [id, w] of Object.entries(core)) {
    if (state.ratings[id] >= 99) continue;
    const c = E.pointCost(id, state.ratings[id], state.archId, state.leagueIdx);
    const score = w / c;
    if (!best || score > best.score) best = { id, score };
  }
  if (!best) return;
  E.upgrade(state, best.id, 999);
  // Spend remaining coins on other core ratings
  for (let k = 0; k < 40; k++) {
    let b = null;
    for (const [id, w] of Object.entries(core)) {
      if (state.ratings[id] >= 99) continue;
      const c = E.pointCost(id, state.ratings[id], state.archId, state.leagueIdx);
      if (c > state.coins) continue;
      const score = w / c;
      if (!b || score > b.score) b = { id, score };
    }
    if (!b) break;
    if (E.upgrade(state, b.id, 1) === 0) break;
  }
}

for (const archId of ['pg-floor', 'c-rim']) {
  for (let run = 0; run < runs; run++) {
    const arch = E.ARCH_BY_ID[archId];
    const st = E.newCareer({ name: 'Bot', pos: arch.pos, archId });
    let games = 0, seasons = 0;
    const milestones = {};
    const ovrLog = [];
    while (games < cap) {
      const ovr = E.overallOf(st);
      const c = E.contractFor(ovr).name;
      if (!milestones[c]) milestones[c] = { games, league: LEAGUES[st.leagueIdx].name };
      const minutes = E.minutesFor(ovr);
      const res = simulateGame({ ratings: st.ratings, overall: ovr, pos: st.pos, minutes, league: LEAGUES[st.leagueIdx], name: 'Bot', mate: 'Mate' });
      E.applyGame(st, res);
      games++;
      spend(st);
      if (st.seasonStats.gp >= SEASON_GAMES) {
        const sum = E.finishSeason(st);
        seasons++;
        ovrLog.push(`${sum.league.slice(0, 5)} S${sum.season} ovr${sum.ovr} gs36=${sum.playerGs36.toFixed(1)} vs ${sum.topRival.toFixed(1)} ${sum.mvp ? 'MVP' : ''}`);
        if (E.canAscend(st)) {
          const coinsBefore = st.coins;
          E.ascend(st);
          console.log(`  ASCEND -> ${LEAGUES[st.leagueIdx].name} after ${games} games, ${seasons} seasons (coins ${Math.round(coinsBefore)})`);
          milestones[`ascend${st.ascensions}`] = games;
        }
        if (st.leagueIdx === LEAGUES.length - 1 && E.overallOf(st) >= 99 && st.mvpThisLeague >= 1) break;
      }
      if (seasons > 400) break;
    }
    console.log(`${archId} run ${run}: games=${games} seasons=${seasons} ovr=${E.overallOf(st)} ascensions=${st.ascensions} league=${LEAGUES[st.leagueIdx].name} coins=${Math.round(st.coins)}`);
    console.log('  milestones', JSON.stringify(milestones));
    console.log('  sample seasons:', ovrLog.slice(0, 3).concat(ovrLog.slice(-2)).join(' | '));
  }
}
