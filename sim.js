// ===== Possession-level game simulation with play-by-play events =====
// Pure logic (no DOM) so it can be balance-tested under Node.

import { coreWeights } from './data.js';

const POSSESSIONS = 100;   // possessions per team per game (4 quarters x 25)
const REB_POS = { PG: 0.4, SG: 0.55, SF: 0.85, PF: 1.15, C: 1.3 };
const CYCLE_MIN = 0.48;    // game minutes per possession cycle (48 / 100)

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function gaussian(mu, sd) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function computeOverall(ratings, pos, archId) {
  const core = coreWeights(pos, archId);
  let s = 0, w = 0;
  for (const [id, wt] of Object.entries(core)) { s += ratings[id] * wt; w += wt; }
  return Math.round(s / w);
}

const T = {
  three:   ['{p} pulls up from downtown... BANG! Three!', '{p} steps back and buries the triple!', '{p} catches and fires. Splash!'],
  mid:     ['{p} rises from the elbow. Nothing but net.', '{p} hits the pull-up jumper.', '{p} fadeaway, and it is good!'],
  inside:  ['{p} attacks the rim and finishes through contact!', '{p} lays it in softly off the glass.', '{p} with a tough finish in the paint.'],
  missThree: ['{p} misses the three. Long rebound.', '{p} fires from deep... off the iron.'],
  missMid:   ['{p} rimmed out the jumper.', '{p} misses the fadeaway.'],
  missIn:    ['{p} can\'t finish at the rim. Rolls out.', '{p} blocked off the glass, no whistle.'],
  orb:     ['{p} crashes the glass for the offensive board!', '{p} tips it back in the hunt. Second chance!'],
  drb:     ['{p} secures the defensive rebound.', '{p} boxes out and grabs it.'],
  tov:     ['{p} loses the handle. Turnover!', '{p} tries to thread it and it is picked off.'],
  steal:   ['{p} jumps the passing lane. STEAL!', '{p} rips it away! Fast break coming.'],
  block:   ['{p} rejects the shot! BLOCKED!', '{p} erases it at the rim. Monster block!'],
  assist:  ['{p} zips the pass. {m} scores. Assist!', '{p} finds {m} for the bucket. Assist!'],
  teamMake:['{m} knocks down a shot.', '{m} scores in the half-court.'],
  teamMiss:['{m} misses. Rebound on the other end.', '{m} can\'t get it to fall.'],
  oppMake: ['{o} scores.', '{o} gets a bucket on the break.', '{o} drains a jumper.'],
  oppMiss: ['{o} misses. The ball is loose.', '{o} can\'t convert.'],
  oppReb:  ['Rebound to the opponent.', 'The opponent comes down with the board.'],
  foul:    ['{p} is fouled on the drive. Two from the line.', '{p} draws a shooting foul.'],
  ftMade:  ['{p} drains the free throws.', '{p} hits both from the line.'],
  ftMiss:  ['{p} misses one from the stripe.', '{p} clanks a free throw.'],
  andOne:  ['And-one! {p} converts the free throw.'],
  defFoul: ['Foul called on {p} on defense.'],
};
const fill = (s, vars) => s.replace(/\{(\w)\}/g, (_, k) => vars[k] ?? '');

function clockStr(i) {
  const secsLeft = Math.max(0, 720 - (i % 25) * CYCLE_MIN * 60);
  const m = Math.floor(secsLeft / 60), s = Math.floor(secsLeft % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function gameScore(b) {
  return b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb
       + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;
}

/**
 * Simulate one full game.
 * @param {object} o { ratings, overall, pos, minutes, league, opponent, name, mate }
 * @returns {{events, box, own, opp, won, gs36, opponent}}
 */
export function simulateGame(o) {
  const r = o.ratings, ovr = o.overall, name = o.name || 'You';
  const mate = o.mate || 'Teammate';
  const league = o.league;
  const ownQ = league.teamOvr + rnd(-3, 3);
  const oppQ = league.teamOvr + rnd(-5, 5);
  const oppName = o.opponent || 'Opponent';
  const onP = clamp(o.minutes / 48, 0, 1);
  const rp = REB_POS[o.pos] ?? 1;
  // Rebound chance grows with the square of the rating, so average ratings get few boards
  const rebP = (rating, scale) => Math.min(0.25, rp * scale * Math.pow(rating / 100, 2));

  const box = { min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
  const events = [];
  let own = 0, opp = 0;

  const push = (i, cls, text) => events.push({ q: Math.floor(i / 25) + 1, clock: clockStr(i), cls, text: fill(text, { p: name, m: mate, o: oppName }), own, opp });
  const ftPct = clamp(0.5 + (r.ft - 50) / 220, 0.45, 0.97);

  for (let i = 0; i < POSSESSIONS; i++) {
    if (i % 25 === 0) events.push({ q: Math.floor(i / 25) + 1, clock: '12:00', cls: 'sys', text: `Start of Quarter ${Math.floor(i / 25) + 1}`, own, opp });
    const on = chance(onP);
    if (on) box.min += CYCLE_MIN;
    const clutchTime = Math.floor(i / 25) === 3 && Math.abs(own - opp) <= 6;

    // ---------- OWN POSSESSION ----------
    if (!on) {
      if (chance(clamp(0.47 + (ownQ - oppQ) / 250, 0.3, 0.7))) {
        own += 2 + (chance(0.36) ? 1 : 0);
        push(i, 'bench', '{m} scores while you\'re on the bench.');
      } else push(i, 'bench', '{m} misses on the bench.');
    } else {
      const usage = clamp(0.16 + ((r.handle + r.iq + r.inside + r.three + r.mid) / 5 - 50) / 250, 0.12, 0.36);
      if (!chance(usage)) {
        // Teammate-led possession with you on the floor
        const mp = clamp(0.47 + (ownQ - oppQ) / 250 + (ovr - ownQ) / 1200 + (r.pass - 50) / 1000, 0.3, 0.7);
        if (chance(mp)) {
          const three = chance(0.36);
          own += three ? 3 : 2;
          if (chance(clamp(0.05 + r.pass / 400, 0.05, 0.3))) {
            box.ast++;
            push(i, 'key', pick(T.assist));
          } else push(i, 'team', pick(T.teamMake));
        } else {
          if (chance(rebP(r.orb, 0.08))) { box.orb++; push(i, 'key', pick(T.orb)); }
          else push(i, 'team', pick(T.teamMiss));
        }
      } else {
        // You have the ball
        if (chance(clamp(0.04 + (100 - r.handle) / 900 + (100 - r.iq) / 1500, 0.03, 0.14))) {
          box.tov++;
          push(i, 'bad', pick(T.tov));
        } else {
          const wt = 0.15 + r.three / 150, wm = 0.15 + r.mid / 150, wi = 0.15 + r.inside / 150;
          const x = Math.random() * (wt + wm + wi);
          const type = x < wt ? 'three' : x < wt + wm ? 'mid' : 'inside';
          let p = type === 'three' ? 0.20 + r.three / 400
                : type === 'mid' ? 0.25 + r.mid / 420
                : 0.34 + r.inside / 380;
          p -= (oppQ - 55) / 300 + 0.03;
          if (clutchTime) p += (r.clutch - 50) / 500;
          p = clamp(p, 0.1, 0.85);

          box.fga++;
          if (type === 'three') box.tpa++;
          const made = chance(p);

          if (type === 'inside' && chance(0.12)) {
            // Shooting foul: free throws
            push(i, 'key', pick(T.foul));
            if (made) { box.fgm++; box.pts += 2; own += 2; }
            const attempts = made ? 1 : 2;
            for (let k = 0; k < attempts; k++) {
              box.fta++;
              if (chance(ftPct)) { box.ftm++; box.pts++; own++; }
            }
            push(i, 'key', chance(0.6) ? pick(T.ftMade) : pick(T.ftMiss));
          } else if (made) {
            box.fgm++;
            if (type === 'three') { box.tpm++; box.pts += 3; own += 3; }
            else { box.pts += 2; own += 2; }
            push(i, 'key', pick(T[type]));
          } else {
            if (chance(rebP(r.orb, 0.2))) {
              box.orb++;
              push(i, 'key', pick(T['miss' + (type === 'three' ? 'Three' : type === 'mid' ? 'Mid' : 'In')]));
              push(i, 'key', pick(T.orb));
            } else {
              push(i, 'team', pick(T['miss' + (type === 'three' ? 'Three' : type === 'mid' ? 'Mid' : 'In')]).replace('{p}', name));
            }
          }
        }
      }
    }

    // ---------- OPPONENT POSSESSION ----------
    const defComp = (r.perD + r.intD) / 2;
    let oMake = 0.47 + (oppQ - ownQ) / 250;
    if (on) oMake -= (defComp - 50) / 500;
    oMake = clamp(oMake, 0.2, 0.75);

    if (on && chance(0.0005 + 0.035 * Math.pow(r.steal / 100, 2.5))) {
      box.stl++;
      push(i, 'key', pick(T.steal));
      continue;
    }
    if (on && chance(0.03)) { box.pf++; push(i, 'bad', pick(T.defFoul)); }

    if (on && chance(0.0005 + 0.035 * Math.pow(r.block / 100, 3))) {
      box.blk++;
      push(i, 'key', pick(T.block));
      if (chance(0.5)) { box.drb++; push(i, 'key', pick(T.drb)); }
      continue;
    }
    if (chance(oMake)) {
      opp += 2 + (chance(0.36) ? 1 : 0);
      push(i, on ? 'bad' : 'opp', pick(T.oppMake));
    } else {
      if (on && chance(rebP(r.drb, 0.35))) { box.drb++; push(i, 'key', pick(T.drb)); }
      else push(i, 'opp', pick(T.oppMiss));
    }
  }

  events.push({ q: 4, clock: '0:00', cls: 'sys', text: `FINAL: ${own}-${opp}`, own, opp, final: true });

  box.min = Math.round(box.min * 10) / 10;
  const gs = gameScore(box);
  return {
    events, box, own, opp, won: own > opp, opponent: oppName,
    gs: Math.round(gs * 10) / 10,
    gs36: box.min > 0 ? (gs / box.min) * 36 : 0,
  };
}
