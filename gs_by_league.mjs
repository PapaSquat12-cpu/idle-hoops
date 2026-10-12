// Measures the average Game Score per 36 for a fully maxed (99) player in each league,
// and the spread of a top rival. Used to set MVP benchmarks.
import { LEAGUES, RATINGS } from '../src/data.js';
import { simulateGame } from '../src/sim.js';
import * as E from '../src/engine.js';

const N = 300;
const ratings99 = Object.fromEntries(RATINGS.map((r) => [r.id, 99]));
const ratings70 = Object.fromEntries(RATINGS.map((r) => [r.id, 70]));
LEAGUES.forEach((lg, li) => {
  for (const [label, rt] of [['99', ratings99], ['70', ratings70]]) {
    let gs36 = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateGame({ ratings: rt, overall: 99, pos: 'C', minutes: 36, league: lg, name: 'X', mate: 'M' });
      gs36 += r.gs36 / N;
    }
    console.log(`${li} ${lg.name.padEnd(20)} ovr${label} GS/36=${gs36.toFixed(1)} mvpMu=${lg.mvpMu} teamOvr=${lg.teamOvr}`);
  }
});
