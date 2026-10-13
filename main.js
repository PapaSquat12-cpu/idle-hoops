// ===== UI controller, game loop, save/load =====
import {
  POSITIONS, ARCHETYPES, RATINGS, CATEGORIES, LEAGUES, CONTRACTS, SEASON_GAMES,
  FIRST_NAMES, LAST_NAMES, AD_SPONSORS, ADS, TRAINING, MAX_RATING, LEGACY_RATING_BONUS, LEGACY_EARN_BONUS, AWAY_EARN_MULT, BODY, INVEST, CLUTCH, DAILY,
} from './data.js';
import { simulateGame } from './sim.js';
import * as E from './engine.js';

const SAVE_KEY = 'idle-hoops-career-v2';
const GAME_MS = 20000;          // real time for one game at 1x while you are watching
const SPEEDS = [1, 2, 4];       // playback speeds while watching
const MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;           // away-time earnings cap: 24 hours
const IDLE_MS = 90000;          // no interaction for this long = away

const $ = (s) => document.querySelector(s);
const RATING_NAME = Object.fromEntries(RATINGS.map((r) => [r.id, r.name]));
// Only touch the DOM when the markup changed, so buttons aren't replaced under a tap
const htmlCache = new WeakMap();
function setHTML(el, html) { if (htmlCache.get(el) !== html) { el.innerHTML = html; htmlCache.set(el, html); } }
const h = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const i = Math.min(SUF.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(10, 3 * i);
  return v.toFixed(v < 100 ? 2 : 1) + SUF[i];
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

let state = null;
const ui = {
  speed: 1, paused: false, buy: 1, game: null, lastActive: Date.now(),
  createPos: 'PG', createArch: null,
  body: null,
  trainRaf: null, trainStart: 0, trainCdUntil: 0,
  ad: null, nextAdAt: 0, feedCount: 0, rowEls: {},
};

// ---------- persistence ----------
function save() {
  if (!state) return;
  state.savedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, E.serialize(state)); } catch (e) { /* storage full or blocked */ }
}
function load() {
  try { return E.deserialize(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}
function wipe() { localStorage.removeItem(SAVE_KEY); }

// ---------- toast & modal ----------
let toastTimer = null;
function toast(msg, gold = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (gold ? ' gold' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3800);
}
function openModal({ title, body, ok = 'Confirm', cancel = 'Cancel', onOk }) {
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = body;
  $('#mOk').textContent = ok;
  $('#mCancel').textContent = cancel;
  $('#mCancel').onclick = () => $('#modal').classList.add('hidden');
  $('#mOk').onclick = () => { $('#modal').classList.add('hidden'); onOk && onOk(); };
  $('#modal').classList.remove('hidden');
}

// ---------- screens ----------
function showCreate() {
  $('#create').classList.remove('hidden');
  $('#game').classList.add('hidden');
  $('#continueBtn').classList.toggle('hidden', !state);
  renderCreate();
}
function showGame() {
  $('#create').classList.add('hidden');
  $('#game').classList.remove('hidden');
  buildRatingRows();
  buildSpeedSeg();
  renderAll();
}

// ================= CREATE =================
function renderCreate() {
  ui.body = E.clampBody(ui.body || E.bodyMid(ui.createPos), ui.createPos);
  const tabs = $('#posTabs');
  tabs.innerHTML = '';
  for (const p of POSITIONS) {
    const b = h('button', ui.createPos === p.id ? 'on' : '', p.id);
    b.title = p.name;
    b.onclick = () => { ui.createPos = p.id; ui.createArch = null; ui.body = null; renderCreate(); };
    tabs.appendChild(b);
  }
  const pos = POSITIONS.find((p) => p.id === ui.createPos);
  $('#posBlurb').textContent = `${pos.name}: ${pos.blurb}`;

  const list = E.archetypesFor(ui.createPos);
  if (!ui.createArch || !list.some((a) => a.id === ui.createArch)) ui.createArch = list[0].id;
  $('#archCount').textContent = `${list.length} archetypes`;
  renderArchGrid();
  renderBodyCard();
  renderArchDetail(ui.createArch, ui.createPos);
}

function renderArchGrid() {
  const list = E.archetypesFor(ui.createPos);
  const grid = $('#archGrid');
  grid.innerHTML = '';
  for (const a of list) {
    const ovr = E.computeOverall(E.startingRatings(a.id, 0, ui.body), ui.createPos, a.id);
    const card = h('button', 'arch' + (a.id === ui.createArch ? ' on' : ''));
    card.innerHTML = `<b>${a.name}</b><p>${a.desc}</p><div class="chips"><span class="chip">Start OVR ${ovr}</span></div>`;
    card.onclick = () => { ui.createArch = a.id; renderCreate(); };
    grid.appendChild(card);
  }
}

const fmtHeight = (inches) => `${Math.floor(inches / 12)}'${inches % 12}"`;

function renderBodyCard() {
  const b = ui.body;
  const r = E.bodyRange(ui.createPos);
  $('#bodyCard').innerHTML = `
    <div class="cardhead">3. Height &amp; Weight</div>
    <p class="muted small">Range for ${ui.createPos}: ${fmtHeight(r.height.min)}–${fmtHeight(r.height.max)}, ${r.weight.min}–${r.weight.max} lb. Your build sets starting ratings and a few rating caps.</p>
    <label class="slider-row"><span>Height</span><b id="bHeight">${fmtHeight(b.height)}</b>
      <input type="range" id="bHeightIn" min="${r.height.min}" max="${r.height.max}" step="1" value="${b.height}"></label>
    <label class="slider-row"><span>Weight</span><b id="bWeight">${b.weight} lb</b>
      <input type="range" id="bWeightIn" min="${r.weight.min}" max="${r.weight.max}" step="5" value="${b.weight}"></label>
    <div id="bodyFx" class="chips" style="margin-top:8px"></div>`;
  const onChange = () => {
    ui.body = { height: Number($('#bHeightIn').value), weight: Number($('#bWeightIn').value) };
    $('#bHeight').textContent = fmtHeight(ui.body.height);
    $('#bWeight').textContent = `${ui.body.weight} lb`;
    renderBodyFx();
    renderArchGrid();
    renderArchDetail(ui.createArch, ui.createPos);
  };
  $('#bHeightIn').oninput = onChange;
  $('#bWeightIn').oninput = onChange;
  renderBodyFx();
}

function renderBodyFx() {
  const fx = E.bodyEffects(ui.body, ui.createPos);
  const parts = [
    ...fx.shifts.map((s) => `<span class="chip ${s.delta > 0 ? 'up' : 'pricey'}">${s.name} ${s.delta > 0 ? '+' : ''}${s.delta}</span>`),
    ...fx.caps.map((c) => `<span class="chip cheap">${c.name} cap +${c.bonus}</span>`),
  ];
  $('#bodyFx').innerHTML = parts.length ? parts.join('') : '<span class="muted small">Average build: no rating shifts.</span>';
}

function renderArchDetail(archId, pos) {
  const a = E.ARCH_BY_ID[archId];
  const start = E.startingRatings(archId, 0, ui.body);
  const boosts = Object.entries(a.boosts).sort((x, y) => y[1] - x[1]);
  const cheap = Object.entries(a.cost).filter(([, m]) => m < 1).map(([c, m]) => `${c} -${Math.round((1 - m) * 100)}%`);
  const pricey = Object.entries(a.cost).filter(([, m]) => m > 1).map(([c, m]) => `${c} +${Math.round((m - 1) * 100)}%`);
  const rows = RATINGS.map((r) => {
    const core = E.coreWeights(pos, archId)[r.id];
    return `<div class="stat-row"><span>${core ? '★ ' : ''}${r.name}</span><b>${start[r.id]}</b></div>`;
  }).join('');
  $('#archDetail').innerHTML = `
    <div class="cardhead">Starting Build: ${a.name}</div>
    <p class="muted">${a.desc}</p>
    <div class="chips">
      ${boosts.map(([k, v]) => `<span class="chip up">${RATINGS.find((r) => r.id === k).name} +${v}</span>`).join('')}
    </div>
    <div class="chips" style="margin-top:8px">
      ${cheap.map((c) => `<span class="chip cheap">Cheaper: ${c}</span>`).join('')}
      ${pricey.map((c) => `<span class="chip pricey">Pricier: ${c}</span>`).join('')}
    </div>
    <p class="muted small" style="margin-top:10px">Starting Overall: <b style="color:var(--gold)">${E.computeOverall(start, pos, archId)}</b>. Stars (★) mark ratings that make up Overall for this position and archetype. Other ratings still affect game results.</p>
    <div class="stats">${RATINGS.map((r) => `<div><span>${r.name}</span><b>${start[r.id]}</b></div>`).join('')}</div>
  `;
}

function startCareer() {
  const nameIn = $('#pname').value.trim();
  const name = nameIn || `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  state = E.newCareer({ name, pos: ui.createPos, archId: ui.createArch, body: E.clampBody(ui.body, ui.createPos) });
  ui.game = null; ui.feedCount = 0;
  $('#feed').innerHTML = '';
  $('#lastGame').innerHTML = `<div class="cardhead">Last Game</div><div class="muted">No games yet. Your first tip-off is coming up.</div>`;
  save();
  ui.nextAdAt = Date.now() + E.adGapSec(state) * 1000;
  toast(`Welcome to the G League, ${name}. Your first game is about to start.`, true);
  showGame();
}

// ================= RATINGS =================
function buildRatingRows() {
  const list = $('#ratingList');
  list.innerHTML = '';
  ui.rowEls = {};
  for (const cat of CATEGORIES) {
    list.appendChild(h('div', 'catlbl', cat));
    for (const r of RATINGS.filter((x) => x.cat === cat)) {
      const row = h('div', 'rrow');
      row.innerHTML = `
        <div class="rtop"><div class="rname"><span class="star"></span>${r.name}</div>
          <div class="bar"><i></i></div></div>
        <div class="val"></div>
        <div class="cost"></div>
        <button></button>`;
      row.title = r.desc;
      row.querySelector('button').onclick = () => buyRating(r.id);
      list.appendChild(row);
      ui.rowEls[r.id] = row;
    }
  }
}

function buyRating(id) {
  const amt = ui.buy === 'max' ? 9999 : ui.buy;
  const got = E.upgrade(state, id, amt);
  if (got > 0) {
    const row = ui.rowEls[id];
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 300);
    save();
  }
  renderAll();
}

function renderRatings() {
  const core = E.coreWeights(state.pos, state.archId);
  for (const r of RATINGS) {
    const row = ui.rowEls[r.id];
    if (!row) continue;
    const v = state.ratings[r.id];
    const cap = E.ratingCap(state, r.id);
    const isCore = !!core[r.id];
    row.classList.toggle('core', isCore);
    row.querySelector('.star').textContent = isCore ? '★' : '';
    row.querySelector('.bar i').style.width = `${(v / MAX_RATING) * 100}%`;
    row.querySelector('.val').textContent = v;
    const btn = row.querySelector('button');
    const costEl = row.querySelector('.cost');
    if (v >= MAX_RATING) {
      costEl.textContent = 'MAX';
      btn.textContent = '—';
      btn.disabled = true;
      continue;
    }
    // Plan the purchase, including Cap Breakers for points beyond the cap
    const plan = E.planUpgrade(state, r.id, ui.buy === 'max' ? 9999 : ui.buy);
    if (plan.n === 0) {
      if (v >= cap) {
        costEl.textContent = `Cap ${cap}`;
        costEl.title = 'Capped. Each point above the cap costs a Cap Breaker plus its coin price.';
        btn.textContent = state.capBreakers > 0 ? '+1 ◆' : 'Capped';
        btn.disabled = state.capBreakers < 1 || state.coins < E.pointCost(r.id, v, state.archId, state.leagueIdx);
      } else {
        costEl.textContent = `${fmt(E.pointCost(r.id, v, state.archId, state.leagueIdx))}`;
        btn.textContent = ui.buy === 'max' ? 'Max' : '+0';
        btn.disabled = true;
      }
    } else {
      btn.textContent = plan.breakers > 0 ? `+${plan.n} ◆${plan.breakers}` : `+${plan.n}`;
      btn.disabled = false;
      costEl.textContent = `${fmt(plan.total)}`;
      costEl.title = plan.breakers > 0 ? `Uses ${plan.breakers} Cap Breaker${plan.breakers > 1 ? 's' : ''} (◆)` : `Next point: ${fmt(E.pointCost(r.id, v, state.archId, state.leagueIdx))} coins`;
    }
  }
  document.querySelectorAll('#buySeg button').forEach((b) => b.classList.toggle('on', String(ui.buy) === b.dataset.buy));
}

// ================= HEADER / CARDS =================
function buildSpeedSeg() {
  const seg = $('#speedSeg');
  seg.innerHTML = '';
  for (const s of SPEEDS) {
    const b = h('button', ui.speed === s ? 'on' : '', `${s}x`);
    b.onclick = () => { ui.speed = s; markActive(); buildSpeedSeg(); renderAll(); };
    seg.appendChild(b);
  }
}

function renderAll() {
  if (!state) return;
  renderInvest();
  renderDaily();
  renderClutch();
  const ovr = E.overallOf(state);
  const league = LEAGUES[state.leagueIdx];
  const contract = E.contractFor(ovr);
  const next = E.nextContract(ovr);
  const minutes = E.minutesFor(ovr);
  const s = state.seasonStats;
  const arch = E.ARCH_BY_ID[state.archId];
  const perGame = E.gameEarnings({ overall: ovr, minutes, gs36: 15, leagueIdx: state.leagueIdx, ascensions: state.ascensions });

  $('#hName').textContent = state.name;
  $('#hSub').textContent = `${state.pos} · ${arch.name} · ${fmtHeight(state.body.height)}, ${state.body.weight} lb${state.ascensions ? ` · Ascension ${state.ascensions}` : ''}`;
  $('#hLeague').textContent = league.name;
  $('#hSeason').textContent = `${state.season} · G ${s.gp}/${SEASON_GAMES}`;
  $('#hRecord').textContent = `${s.w}-${s.l}`;
  $('#hCoins').textContent = fmt(state.coins);
  $('#hBreakers').textContent = state.capBreakers;
  $('#careerInfo').innerHTML = `
    <div><span>Name</span><b>${state.name}</b></div>
    <div><span>Position</span><b>${state.pos} · ${E.ARCH_BY_ID[state.archId].name}</b></div>
    <div><span>League</span><b>${LEAGUES[state.leagueIdx].name}</b></div>
    <div><span>Ascensions</span><b>${state.ascensions}</b></div>
    <div><span>Legacy bonus</span><b>+${Math.round(LEGACY_EARN_BONUS * state.ascensions * 100)}% pay</b></div>
    <div><span>Build</span><b>${fmtHeight(state.body.height)}, ${state.body.weight} lb</b></div>`;
  $('#hRate').textContent = `~${fmt(perGame)} / game`;

  const ovrEl = $('#ovr');
  if (ovrEl.textContent !== String(ovr) && ovrEl.textContent !== '--') { ovrEl.classList.remove('bump'); void ovrEl.offsetWidth; ovrEl.classList.add('bump'); }
  ovrEl.textContent = ovr;
  $('#contractName').textContent = contract.name;
  $('#minTarget').textContent = `${f1(minutes)} min`;
  $('#nextContract').textContent = next ? `${next.name} at ${next.minOvr} OVR` : 'Top contract reached';
  $('#legacy').textContent = state.ascensions ? `+${state.ascensions * LEGACY_RATING_BONUS} rating, +${Math.round(state.ascensions * LEGACY_EARN_BONUS * 100)}% pay` : 'None yet';

  const ovrOk = ovr >= 99, mvpOk = state.mvpThisLeague >= 1;
  $('#reqOvr').className = 'req' + (ovrOk ? ' done' : '');
  $('#reqOvr').textContent = `Overall 99 (now ${ovr})`;
  $('#reqMvp').className = 'req' + (mvpOk ? ' done' : '');
  $('#reqMvp').textContent = mvpOk ? `League MVP won in ${league.name}` : `Win league MVP in ${league.name} (need best Game Score/36 in the league)`;
  const finalLeague = state.leagueIdx >= LEAGUES.length - 1;
  $('#reqMvp').textContent = finalLeague && mvpOk ? 'Legends League MVP. You are the GOAT.' : $('#reqMvp').textContent;
  $('#ascendBtn').classList.toggle('hidden', !E.canAscend(state));

  const gp = s.gp || 1;
  const grid = [
    ['PPG', f1(s.pts / gp)], ['RPG', f1(s.reb / gp)], ['APG', f1(s.ast / gp)],
    ['SPG', f1(s.stl / gp)], ['BPG', f1(s.blk / gp)], ['TOV', f1(s.tov / gp)],
    ['FG%', pct(s.fgm, s.fga)], ['3P%', pct(s.tpm, s.tpa)], ['MIN', f1(s.gp ? s.min / s.gp : 0)],
  ];
  $('#seasonGrid').innerHTML = grid.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  const gsNow = s.min > 0 ? (s.gsSum / s.min) * 36 : 0;
  $('#gsNow').textContent = s.gp ? f1(gsNow) : '-';
  $('#gsBench').textContent = f1(E.mvpBenchmark(state.leagueIdx));
  const ls = state.lastSeason;
  $('#lastSeason').innerHTML = ls
    ? `Last season (${ls.league}): ${ls.w}-${ls.l}, GS/36 ${f1(ls.playerGs36)} vs top rival ${f1(ls.topRival)}. ${ls.mvp ? '<span class="gain">League MVP!</span>' : 'No MVP.'}`
    : 'First season in progress.';

  $('#careerGrid').innerHTML = [
    ['Games', fmt(state.career.games)], ['Seasons', state.career.seasons],
    ['MVPs', state.career.mvps], ['Ascensions', state.career.ascensions],
    ['Coins earned', fmt(state.career.coinsEarned)], ['Coins spent', fmt(state.career.coinsSpent)],
    ['Best GS/36', f1(state.career.bestGs36)], ['Drill + Ads', fmt(state.career.training + state.career.ads)],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

  $('#ladder').innerHTML = CONTRACTS.map((c, i) => {
    const cls = i === contract.index ? 'on' : i < contract.index ? 'past' : '';
    const pay = Math.round(c.base * Math.pow(league.coinMult, 1) * (1 + LEGACY_EARN_BONUS * state.ascensions));
    return `<div class="lad ${cls}"><span>${c.name} <small>(${c.minOvr}+)</small></span><span>${fmt(pay)}/g</span></div>`;
  }).join('');

  $('#pauseBtn').textContent = ui.paused ? 'Resume' : 'Pause';
  const away = isAway();
  $('#paceBadge').textContent = away ? `Away · ${Number(E.awayPace(state).toFixed(2))}x pace` : `Watching · ${effectiveSpeed()}x`;
  $('#paceBadge').className = 'pace ' + (away ? 'away' : 'watch');
  renderRatings();
}

// ================= GAME LOOP =================
// Simulate the next game for the current career (shared by live play and offline progress)
function simulateNext() {
  const ovr = E.overallOf(state);
  const league = LEAGUES[state.leagueIdx];
  const mate = pick(['Jordan', 'Chris', 'Reed', 'Tate', 'Lewis', 'Kane', 'Ibarra', 'Walsh']);
  const opponent = pick(league.teams);
  const res = simulateGame({
    ratings: state.ratings, overall: ovr, pos: state.pos, minutes: E.minutesFor(ovr),
    league, opponent, name: state.name.split(' ').slice(-1)[0] || 'You', mate,
  });
  return { res, opponent };
}

// Games played while the page was closed: run at away pace, stop before an ascension decision
function applyOfflineProgress() {
  const elapsed = Date.now() - (state.savedAt || Date.now());
  if (elapsed < 60000) return null;
  const gameMs = GAME_MS / E.awayPace(state);          // one game every gameMs while the page is closed
  const maxGames = Math.floor(MAX_OFFLINE_MS / gameMs);
  const budget = Math.min(Math.floor(elapsed / gameMs), maxGames);
  const sum = { elapsed, gameMs, capped: elapsed / gameMs > maxGames, games: 0, wins: 0, losses: 0, seasons: 0, mvps: 0, coins: 0, pausedForAscend: false, startLeague: LEAGUES[state.leagueIdx].name };
  for (let i = 0; i < budget; i++) {
    if (E.canAscend(state)) { sum.pausedForAscend = true; break; }
    const { res } = simulateNext();
    sum.coins += E.applyGame(state, res, AWAY_EARN_MULT);
    sum.games++;
    if (res.won) sum.wins++; else sum.losses++;
    if (state.seasonStats.gp >= SEASON_GAMES) {
      const s = E.finishSeason(state);
      sum.seasons++;
      if (s.mvp) sum.mvps++;
    }
  }
  if (!sum.pausedForAscend && E.canAscend(state)) sum.pausedForAscend = true;
  save();
  return sum;
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60), rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function showOfflineSummary(sum) {
  openModal({
    title: 'While you were away',
    body: `<p>You were away for <b>${formatDuration(sum.elapsed)}</b>. Games ran at away pace (one every ${Math.round(sum.gameMs / 1000)}s at ${Number(E.awayPace(state).toFixed(2))}x).</p>
      <ul>
        <li>Games played: <b>${sum.games}</b> (${sum.wins}-${sum.losses})</li>
        <li>Seasons completed: <b>${sum.seasons}</b>${sum.mvps ? `, MVPs: <b>${sum.mvps}</b>` : ''}</li>
        <li>Coins earned: <b class="gain">+${fmt(sum.coins)}</b></li>
      </ul>
      ${sum.capped ? `<p class="muted small">Offline progress is capped at ${formatDuration(MAX_OFFLINE_MS)}.</p>` : ''}
      ${sum.pausedForAscend ? '<p><b>You are eligible to ascend.</b> Offline play stopped so you can decide when to move up.</p>' : ''}`,
    ok: 'Back to the court', cancel: 'Close',
  });
}

function startGame() {
  const { res, opponent } = simulateNext();
  ui.game = { res, i: 0, events: res.events, gameNo: state.seasonStats.gp + 1 };
  $('#sbYouName').textContent = 'YOU';
  $('#sbOppName').textContent = opponent.toUpperCase();
  $('#sbYou').textContent = '0';
  $('#sbOpp').textContent = '0';
  $('#sbQ').textContent = 'Q1';
  $('#sbClock').textContent = '12:00';
  $('#sbStatus').textContent = 'Live';
  $('#gameLabel').textContent = `Game ${ui.game.gameNo} vs ${opponent}`;
}

function pushEvent(ev) {
  const feed = $('#feed');
  if (ev.cls === 'sys' && ev.text.startsWith('Start of')) {
    // quarter header
  }
  const line = h('div', `line ${ev.cls}`);
  line.innerHTML = `<span class="t">${ev.q ? `Q${ev.q} ${ev.clock}` : ''}</span>${escapeHtml(ev.text)}`;
  feed.appendChild(line);
  ui.feedCount++;
  while (feed.children.length > 150) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
  $('#sbYou').textContent = ev.own;
  $('#sbOpp').textContent = ev.opp;
  $('#sbQ').textContent = `Q${ev.q}`;
  $('#sbClock').textContent = ev.clock;
  if (ev.final) $('#sbStatus').textContent = ev.own > ev.opp ? 'Final · Win' : 'Final · Loss';
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function finishGame(instant) {
  const { res } = ui.game;
  const earn = E.applyGame(state, res, isAway() ? AWAY_EARN_MULT : 1);
  if (!isAway()) announceDaily(E.recordDaily(state, 'game', res));
  const b = res.box;
  const s = state.seasonStats;
  const wl = res.won ? '<span class="win">WIN</span>' : '<span class="loss">LOSS</span>';
  $('#lastGame').innerHTML = `
    <div class="cardhead">Last Game</div>
    <div class="headline">${wl} ${res.own}-${res.opp} vs ${res.opponent} · <span class="gain">+${fmt(earn)} coins</span></div>
    <div class="gl">
      <div><span>Points</span><b>${b.pts}</b></div>
      <div><span>Rebounds</span><b>${b.orb + b.drb}</b></div>
      <div><span>Assists</span><b>${b.ast}</b></div>
      <div><span>Stl / Blk</span><b>${b.stl} / ${b.blk}</b></div>
      <div><span>FG</span><b>${b.fgm}/${b.fga}</b></div>
      <div><span>3PT</span><b>${b.tpm}/${b.tpa}</b></div>
      <div><span>Minutes</span><b>${f1(b.min)}</b></div>
      <div><span>GS / 36</span><b>${f1(res.gs36)}</b></div>
    </div>`;
  if (!instant) pushEvent({ q: 0, clock: '', cls: 'sys', text: `Game over. You had ${b.pts} points, ${b.orb + b.drb} rebounds and ${b.ast} assists. Earned ${fmt(earn)} coins.` });
  ui.game = null;
  renderClutch();

  if (s.gp >= SEASON_GAMES) endSeason();
  save();
}

function endSeason() {
  const sum = E.finishSeason(state);
  if (sum.mvp) {
    toast(`LEAGUE MVP! Season ${sum.season} in the ${sum.league}.`, true);
    $('#hSeason').parentElement.classList.add('flash-gold');
    setTimeout(() => $('#hSeason').parentElement.classList.remove('flash-gold'), 1300);
  } else {
    toast(`Season ${sum.season} complete: ${sum.w}-${sum.l}. No MVP this year.`);
  }
  if (E.canAscend(state)) toast('Requirements met. You can Ascend to the next league!', true);
}

function markActive() { ui.lastActive = Date.now(); }
function isAway() { return document.hidden || Date.now() - ui.lastActive > IDLE_MS; }
function effectiveSpeed() { return isAway() ? E.awayPace(state) : ui.speed; }

async function mainLoop() {
  while (true) {
    if (!state || ui.paused || $('#game').classList.contains('hidden')) { await sleep(150); continue; }
    if (!ui.game) startGame();
    const g = ui.game;
    const sp = effectiveSpeed();
    const perEvent = GAME_MS / sp / g.events.length;
    const ev = g.events[g.i++];
    pushEvent(ev);
    if (ev.q === 4 && !g.clutchChecked) {
      g.clutchChecked = true;
      if (Math.abs(ev.own - ev.opp) <= CLUTCH.closeMargin) { g.clutchOpen = true; renderClutch(); }
    }
    if (g.i >= g.events.length) {
      finishGame(false);
      renderAll();
      await sleep(1200 / sp);
    } else {
      await sleep(perEvent);
      if (g.i % 10 === 0) renderAll();
    }
  }
}

// ================= TRAINING DRILL =================
function startDrill() {
  if (!state || ui.trainRaf) return;
  if (Date.now() < ui.trainCdUntil) return;
  ui.trainStart = performance.now();
  $('#drill').classList.add('active');
  $('#trainBtn').textContent = 'STOP!';
  $('#trainBtn').classList.add('gold');
  $('#trainResult').textContent = 'Stop it in the green zone...';
  const tick = (now) => {
    const t = ((now - ui.trainStart) / 1000) * 1.25;   // ~0.8s per sweep
    const ph = t % 2;
    const p = ph <= 1 ? ph : 2 - ph;                   // 0..1 triangle wave
    $('#marker').style.left = `calc(${p * 100}% - 4px)`;
    ui.trainPos = p;
    if (now - ui.trainStart > 6000) { finishDrill(0.5, 'Ran out of time.'); return; }
    ui.trainRaf = requestAnimationFrame(tick);
  };
  ui.trainRaf = requestAnimationFrame(tick);
  $('#trainBtn').onclick = () => {
    if (ui.trainRaf) {
      const t = ((performance.now() - ui.trainStart) / 1000) * 1.25;
      const ph = t % 2;
      ui.trainPos = ph <= 1 ? ph : 2 - ph;
    }
    finishDrill(null);
  };
}

function finishDrill(forcedQuality, forcedMsg) {
  if (!ui.trainRaf) return;
  cancelAnimationFrame(ui.trainRaf);
  ui.trainRaf = null;
  $('#drill').classList.remove('active');
  $('#trainBtn').textContent = 'Start Drill';
  $('#trainBtn').classList.add('gold');
  $('#trainBtn').onclick = startDrill;
  let quality = forcedQuality, label = forcedMsg || '';
  if (quality == null) {
    const d = Math.abs((ui.trainPos ?? 0.5) - 0.5) * 2;  // 0 = center, 1 = edge
    if (d < 0.1) { quality = 2.0; label = 'PERFECT!'; }
    else if (d < 0.22) { quality = 1.5; label = 'Great'; }
    else if (d < 0.4) { quality = 1.0; label = 'Good'; }
    else { quality = 0.5; label = 'Sloppy'; }
  }
  const coins = E.trainingReward(state, quality);
  if (quality >= 2) { E.awardCapBreaker(state); toast('Perfect drill: +1 Cap Breaker', false); }
  state.coins += coins;
  state.career.training += coins;
  state.career.coinsEarned += coins;
  ui.trainCdUntil = Date.now() + E.trainingCooldownSec(state) * 1000;
  announceDaily(E.recordDaily(state, 'drill'));
  $('#trainResult').innerHTML = `${label} <span class="gain">+${fmt(coins)}</span>`;
  save();
  renderAll();
}

function updateTrainCd() {
  const left = Math.ceil((ui.trainCdUntil - Date.now()) / 1000);
  $('#trainCd').textContent = left > 0 && !ui.trainRaf ? `ready in ${left}s` : '';
  $('#trainBtn').disabled = left > 0 && !ui.trainRaf;
}

// ================= SPONSOR DEALS =================
function maybeOfferAd() {
  if (!state) return;
  if (ui.ad) {
    const left = (ui.ad.expiresAt - Date.now()) / 1000;
    if (left <= 0) { ui.ad = null; $('#adBox').innerHTML = 'Offer expired. Next one coming up.'; ui.nextAdAt = Date.now() + E.adGapSec(state) * 1000; }
    else {
      const pctLeft = Math.max(0, left / ADS.windowSec) * 100;
      $('#adInfo').textContent = `${Math.ceil(left)}s left`;
      const bar = $('#adBar'); if (bar) bar.style.width = pctLeft + '%';
    }
    return;
  }
  if (Date.now() < ui.nextAdAt) {
    $('#adInfo').textContent = `next offer in ${Math.ceil((ui.nextAdAt - Date.now()) / 1000)}s`;
  }
  if (Date.now() >= ui.nextAdAt) {
    const sponsor = pick(AD_SPONSORS);
    const reward = E.adReward(state);
    ui.ad = { sponsor, reward, expiresAt: Date.now() + ADS.windowSec * 1000 };
    $('#adBox').innerHTML = `
      <div class="offer">
        <b>${sponsor} wants you</b>
        <div class="small muted">A quick promo spot. Pays based on your Overall and ratings.</div>
        <div class="bar-thin"><i id="adBar" style="width:100%"></i></div>
        <div class="row"><span class="gain">+${fmt(reward)} coins</span><button id="adAccept" class="gold">Accept</button></div>
      </div>`;
    $('#adAccept').onclick = acceptAd;
    toast(`Sponsor offer from ${sponsor}`, false);
  }
}

function acceptAd() {
  if (!ui.ad) return;
  const reward = E.adReward(state);
  state.coins += reward;
  state.career.ads += reward;
  state.career.coinsEarned += reward;
  $('#adBox').innerHTML = `<span class="gain">Deal signed!</span> +${fmt(reward)} coins from ${ui.ad.sponsor}.`;
  ui.ad = null;
  ui.nextAdAt = Date.now() + E.adGapSec(state) * 1000;
  announceDaily(E.recordDaily(state, 'ad'));
  save();
  renderAll();
}

// ================= ASCENSION & MENU =================
function ascendPrompt() {
  const next = LEAGUES[state.leagueIdx + 1];
  const curBase = E.startingRatings(state.archId, state.ascensions + 1, state.body);
  const ovr = E.computeOverall(curBase, state.pos, state.archId);
  openModal({
    title: `Ascend to the ${next.name}?`,
    body: `<p>You have reached 99 Overall and won league MVP. Time to move up.</p>
      <ul>
        <li>League: <b>${LEAGUES[state.leagueIdx].name}</b> → <b>${next.name}</b></li>
        <li>Contract pay multiplier: <b>×${next.coinMult}</b> (up from ×${LEAGUES[state.leagueIdx].coinMult})</li>
        <li>Coins reset to 0. Ratings reset to your archetype's base plus +${LEGACY_RATING_BONUS} legacy bonus.</li>
        <li>Your new starting Overall will be about <b>${ovr}</b>.</li>
        <li>Permanent legacy: +${Math.round(LEGACY_EARN_BONUS * 100)}% pay on every future game.</li>
      </ul>`,
    ok: 'Ascend', cancel: 'Not yet',
    onOk: () => {
      if (!E.ascend(state)) return;
      ui.game = null;
      $('#feed').innerHTML = '';
      $('#lastGame').innerHTML = `<div class="cardhead">Last Game</div><div class="muted">New league. New start.</div>`;
      save();
      buildRatingRows();
      toast(`Welcome to the ${LEAGUES[state.leagueIdx].name}! Ascension ${state.ascensions}.`, true);
      renderAll();
    },
  });
}

function menuPrompt() {
  openModal({
    title: 'Career Menu',
    body: `<p>Your career saves automatically every 10 seconds.</p>
      <p class="muted small">Starting a new career deletes the current save. This can't be undone.</p>`,
    ok: 'Delete & start new career', cancel: 'Back',
    onOk: () => {
      wipe(); state = null; ui.game = null; ui.ad = null; ui.createArch = null;
      $('#feed').innerHTML = '';
      showCreate();
      toast('Pick a new player.');
    },
  });
}

// ================= INIT =================
function init() {
  // Create screen
  $('#pname').placeholder = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  $('#startBtn').onclick = startCareer;
  $('#continueBtn').onclick = () => showGame();

  // Game screen
  $('#pauseBtn').onclick = () => { ui.paused = !ui.paused; renderAll(); };
  $('#ascendBtn').onclick = ascendPrompt;
  bindInvest();
  $('#clutchBtn').onclick = claimClutch;
  bindDaily();
  document.querySelectorAll('#game .tabbtn').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  $('#menuBtn').onclick = menuPrompt;
  $('#buySeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ui.buy = b.dataset.buy === 'max' ? 'max' : Number(b.dataset.buy);
    renderRatings();
  });
  $('#trainBtn').onclick = startDrill;
  ['pointerdown', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => document.addEventListener(ev, markActive, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) markActive(); });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && ui.trainRaf && !$('#game').classList.contains('hidden')) { e.preventDefault(); finishDrill(null); }
  });

  // Load or start
  state = load();
  if (state) {
    ui.nextAdAt = Date.now() + E.adGapSec(state) * 1000;
    const offline = applyOfflineProgress();
    showGame();
    if (offline && offline.games > 0) showOfflineSummary(offline);
    else toast(`Welcome back, ${state.name}.`);
  } else {
    showCreate();
  }

  mainLoop();
  setInterval(() => { if (state) { maybeOfferAd(); updateTrainCd(); } }, 250);
  setInterval(() => { if (state && !$('#game').classList.contains('hidden')) renderAll(); }, 1000);
  setInterval(() => { if (state && !$('#game').classList.contains('hidden') && isAway() !== ui.wasAway) { ui.wasAway = isAway(); renderAll(); } }, 1000);
  setInterval(save, 10000);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  // Modal closed by clicking backdrop
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
}

init();

// ================= INVESTMENTS =================
function renderInvest() {
  const el = $('#investBox');
  if (!el || !state) return;
  const row = (kind, title, desc) => {
    const lvl = state.invest[kind];
    const cost = E.investCost(state, kind);
    const can = state.coins >= cost;
    return `
      <div class="inv-row">
        <div class="inv-text"><b>${title} <span class="muted small">Lv ${lvl}</span></b>
          <div class="small muted">${desc(lvl)}</div></div>
        <button data-inv="${kind}" class="${can ? 'gold' : ''}">Upgrade ${fmt(cost)}</button>
      </div>`;
  };
  setHTML(el, `
    ${row('agency', 'Agency', (l) => `+${Math.round(INVEST.agency.payMult * l * 100)}% ad pay · +${Math.round(INVEST.agency.speed * l * 100)}% offers`)}
    ${row('trainer', 'Trainer', (l) => `+${Math.round(INVEST.trainer.payMult * l * 100)}% drill pay · +${Math.round(INVEST.trainer.speed * l * 100)}% speed`)}
    ${row('idle', 'Away Speed', (l) => `Idle games at ${Number(Math.min(INVEST.idle.max, INVEST.idle.base + INVEST.idle.pace * l).toFixed(2))}x`)}`);
}

function bindInvest() {
  $('#investBox').onclick = (e) => {
    const b = e.target.closest('button[data-inv]');
    if (!b || !state) return;
    const kind = b.dataset.inv;
    const now = Date.now();
    const divOld = kind === 'agency' ? E.agencyDivisor(state) : E.trainerDivisor(state);
    if (E.buyInvest(state, kind)) {
      // Rescale the timer already running so the upgrade applies right away
      const divNew = kind === 'agency' ? E.agencyDivisor(state) : E.trainerDivisor(state);
      const ratio = divOld / divNew;
      if (kind === 'agency' && ui.nextAdAt > now) ui.nextAdAt = now + (ui.nextAdAt - now) * ratio;
      if (kind === 'trainer' && ui.trainCdUntil > now) ui.trainCdUntil = now + (ui.trainCdUntil - now) * ratio;
      toast(`${kind === 'agency' ? 'Agency' : 'Trainer'} upgraded`, true);
      save();
    }
    renderAll();
  };
}

// ================= BOTTOM TABS =================
function showTab(name) {
  document.querySelectorAll('#game .tabpanel').forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
  document.querySelectorAll('#game .tabbtn').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
}

// ================= CLUTCH TIME =================
function renderClutch() {
  const g = ui.game;
  const open = !!(state && g && g.clutchOpen && !g.clutchClaimed);
  $('#clutchBar').classList.toggle('hidden', !open);
  if (open) $('#clutchText').textContent = `CLUTCH TIME · Claim +${fmt(E.clutchReward(state))}`;
}

function claimClutch() {
  const g = ui.game;
  if (!state || !g || !g.clutchOpen || g.clutchClaimed) return;
  const pay = E.clutchReward(state);
  g.clutchClaimed = true;
  state.coins += pay;
  state.career.coinsEarned += pay;
  state.career.clutch = (state.career.clutch || 0) + 1;
  pushEvent({ q: 0, clock: '', cls: 'sys', text: `Clutch call: you took over and earned ${fmt(pay)} bonus coins.` });
  toast(`Clutch! +${fmt(pay)} coins`, true);
  renderClutch();
  save();
  renderAll();
}

// ================= DAILY OBJECTIVES =================
function announceDaily(ready) {
  if (!ready || !ready.length) return;
  toast(ready.length === 1 ? `Ready to claim: ${ready[0].label}` : `${ready.length} objectives ready to claim`, true);
  save();
}

function renderDaily() {
  const d = E.ensureDaily(state);
  const rows = E.dailyObjectives(state).map((o) => {
    const pay = fmt(Math.round(E.dailyPayout(state, d.claimed)));
    const right = o.ready
      ? `<button class="gold" data-claim="${o.id}">Claim +${pay}</button>`
      : `<span class="oprog">${o.progress}/${o.target}</span>`;
    return `<div class="obj${o.ready ? ' ready' : ''}"><div class="otxt">${o.ready ? 'Done: ' : 'Next: '}${o.label}</div>${right}</div>`;
  }).join('');
  setHTML($('#dailyBox'), rows);
  const ms = new Date(new Date().setHours(24, 0, 0, 0)) - Date.now();
  const hrs = Math.floor(ms / 3600000), mins = Math.floor((ms % 3600000) / 60000);
  $('#dailyLeft').textContent = `resets in ${hrs}h ${mins}m`;
}

function bindDaily() {
  $('#dailyBox').onclick = (e) => {
    const b = e.target.closest('button[data-claim]');
    if (!b || !state) return;
    const pay = E.claimDaily(state, b.dataset.claim);
    if (!pay) return;
    toast(`Objective claimed +${fmt(pay)} coins`, true);
    save();
    renderAll();
  };
}
