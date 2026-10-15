// ===== Static game configuration =====

export const MAX_RATING = 99;

// Body type: height and weight shift starting ratings and add cap bonuses.
// Units: 1 height unit = 4 inches from 6'6" (78"); 1 weight unit = 30 lb from 210.
// Effects scale across each position's own range: the bottom edge is the full negative
// effect, the top edge the full positive effect, and the midpoint is neutral.
export const BODY = {
  height: { min: 66, max: 91, def: 78 },
  weight: { min: 160, max: 320, def: 210 },
  // Allowed ranges by position (inches, lb). Sliders and the saved build stay inside these.
  byPos: {
    PG: { height: [66, 81], weight: [160, 200] },   // 5'6" - 6'9",  160-200 lb
    SG: { height: [73, 82], weight: [180, 220] },   // 6'1" - 6'10", 180-220 lb
    SF: { height: [76, 83], weight: [200, 250] },   // 6'4" - 6'11", 200-250 lb
    PF: { height: [78, 87], weight: [220, 280] },   // 6'6" - 7'3",  220-280 lb
    C:  { height: [80, 91], weight: [240, 320] },   // 6'8" - 7'7",  240-320 lb
  },
  hPer: 4,
  wPer: 30,
  unitClamp: 1.5,
  startShift: {
    h: { inside: 2, intD: 2, orb: 2, drb: 2, block: 2.5, handle: -1.5, three: -1, speed: -1 },
    w: { str: 3, inside: 1, vert: -1, speed: -1.5 },
  },
  capStep: 5,
  // Position-relative position from -1 (bottom of range) to +1 (top). A rule applies when axis * dir >= at.
  // at = 0.5 means the outer quarter of the range on that side.
  capRules: [
    { axis: 'h', dir: 1,  at: 0.5, ratings: ['intD', 'orb', 'drb', 'block'] },  // tall
    { axis: 'h', dir: -1, at: 0.5, ratings: ['handle', 'three', 'speed'] },     // short
    { axis: 'w', dir: 1,  at: 0.5, ratings: ['str', 'inside'] },                // heavy
    { axis: 'w', dir: -1, at: 0.5, ratings: ['speed', 'handle'] },              // light
  ],
};
// Rating caps by league. Core ratings (and archetype boosts) can always reach 99, so Overall 99 is
// reachable in league 1. Other ratings start at NON_BOOST_CAP and rise each league to 99 by the last league.
export const NON_BOOST_CAP = 80;
// Lowest starting value of the shot ratings (inside, mid, three) across all builds and body types.
// Shot mix is measured above this value, so a rating at the floor takes no shots of that type.
export const SHOT_FLOOR = 40;
export const BASE_RATING = 45;      // every rating starts here before archetype boosts
export const START_CAP = 85;        // archetype starting ratings never exceed this
export const SEASON_GAMES = 82;
// Stamina sets how much of your Overall-based minutes you can play: full minutes at STAMINA_FULL, proportional below.
export const STAMINA_FULL = 90;
export const MAX_MINUTES = 38;   // most minutes any player can play in a game
// MVP rivals: best of 15 draws around mean x bar (spread sd x bar). Tuned with tests/mvp_odds.mjs
// so a 97-Overall build of any archetype wins about 1 MVP every 3 to 11 seasons.
export const MVP_RIVAL = { mean: 0.85, sd: 0.12 };
export const RATING_TICK = 1;       // each purchase adds this much

// Coin cost of one rating point: COST.base * catMult * leagueMult * growth^(value - offset)

// Starting Overall is the same for every archetype and body: START_OVERALL,
// plus OVERALL_PER_ASCENSION for each ascension. Body effects are zero-sum on core ratings.
export const START_OVERALL = 50;
export const OVERALL_PER_ASCENSION = 1;

export const CATEGORIES = ['Offense', 'Defense', 'Rebounding', 'Athletic', 'Mental'];

export const RATINGS = [
  { id: 'inside',  name: 'Inside Scoring',    cat: 'Offense',    desc: 'Finishing at the rim and in traffic' },
  { id: 'mid',     name: 'Mid-Range',         cat: 'Offense',    desc: 'Pull-ups and jumpers from 10-22 feet' },
  { id: 'three',   name: 'Three-Point',       cat: 'Offense',    desc: 'Shooting from beyond the arc' },
  { id: 'ft',      name: 'Free Throw',        cat: 'Offense',    desc: 'Free throw accuracy' },
  { id: 'handle',  name: 'Ball Handling',     cat: 'Offense',    desc: 'Protecting the ball and creating space' },
  { id: 'pass',    name: 'Passing',           cat: 'Offense',    desc: 'Accuracy and timing on passes' },
  { id: 'vision',  name: 'Court Vision',      cat: 'Offense',    desc: 'Seeing open teammates before they do' },
  { id: 'perD',    name: 'Perimeter Defense', cat: 'Defense',    desc: 'Staying in front of ball handlers' },
  { id: 'intD',    name: 'Interior Defense',  cat: 'Defense',    desc: 'Protecting the paint' },
  { id: 'steal',   name: 'Steal',             cat: 'Defense',    desc: 'Jumping passing lanes' },
  { id: 'block',   name: 'Block',             cat: 'Defense',    desc: 'Rejecting shots at the rim' },
  { id: 'orb',     name: 'Off. Rebounding',   cat: 'Rebounding', desc: 'Crashing the offensive glass' },
  { id: 'drb',     name: 'Def. Rebounding',   cat: 'Rebounding', desc: 'Finishing defensive possessions' },
  { id: 'speed',   name: 'Speed',             cat: 'Athletic',   desc: 'Top-end and first-step quickness' },
  { id: 'vert',    name: 'Vertical',          cat: 'Athletic',   desc: 'Leaping ability for dunks and boards' },
  { id: 'str',     name: 'Strength',          cat: 'Athletic',   desc: 'Physicality in the post and on contact' },
  { id: 'stam',    name: 'Stamina',           cat: 'Athletic',   desc: 'Energy over long minutes' },
  { id: 'iq',      name: 'Basketball IQ',     cat: 'Mental',     desc: 'Reads, rotations, and smart decisions' },
  { id: 'clutch',  name: 'Clutch',            cat: 'Mental',     desc: 'Performance in close late-game moments' },
  { id: 'hustle',  name: 'Hustle',            cat: 'Mental',     desc: 'Loose balls, effort plays, and motor' },
];

// Positions define which ratings make up the Overall (the "core" with weights)
export const POSITIONS = [
  { id: 'PG', name: 'Point Guard', blurb: 'Runs the offense. Handle, passing, and vision drive the Overall.',
    core: { handle: 3, pass: 3, vision: 2, three: 2, perD: 2, speed: 2, iq: 2, hustle: 1, mid: 1, ft: 1, stam: 1 } },
  { id: 'SG', name: 'Shooting Guard', blurb: 'Scoring wing. Three-point shooting and perimeter defense.',
    core: { three: 3, mid: 2, handle: 2, ft: 1, perD: 2, speed: 2, iq: 2, hustle: 1, inside: 1, clutch: 1, stam: 1 } },
  { id: 'SF', name: 'Small Forward', blurb: 'Versatile wing. Balanced scoring, defense, and hustle.',
    core: { inside: 2, three: 2, perD: 2, drb: 1, speed: 1, str: 1, iq: 2, mid: 1, hustle: 1, steal: 1, stam: 1 } },
  { id: 'PF', name: 'Power Forward', blurb: 'Interior big. Rebounding, interior defense, and strength.',
    core: { inside: 2, intD: 3, drb: 2, orb: 2, str: 2, block: 2, iq: 1, stam: 1, hustle: 1 } },
  { id: 'C', name: 'Center', blurb: 'Anchor of the paint. Blocks, boards, and interior defense.',
    core: { intD: 3, block: 3, drb: 3, orb: 2, str: 2, inside: 2, vert: 2, iq: 1, hustle: 1, stam: 1 } },
];

// Archetypes: boosts raise starting ratings above BASE_RATING;
// cost multipliers make upgrades in that category cheaper (<1) or pricier (>1).
const A = (id, pos, name, desc, boosts, cost = {}) => ({ id, pos, name, desc, boosts, cost });

// Extra core ratings an archetype adds on top of its position's core (these count toward Overall)
export const ARCH_CORE_EXTRA = {
  'pf-stretch': { three: 2 },   // Stretch Four
  'c-stretch':  { three: 2 },   // Stretch Five
};

// Core weights for a position, plus any archetype extras
export function coreWeights(pos, archId) {
  const base = POSITIONS.find((p) => p.id === pos).core;
  const extra = archId && ARCH_CORE_EXTRA[archId];
  return extra ? { ...base, ...extra } : base;
}

export const ARCHETYPES = [
  // ---- Point Guards
  A('pg-floor', 'PG', 'Floor General', 'Elite court vision and passing. Runs the offense and makes everyone better.', { pass: 24, vision: 22, iq: 14, handle: 10 }, { Offense: 0.85, Mental: 0.85, Defense: 1.1, Athletic: 1.15, Rebounding: 1.3 }),
  A('pg-scorer', 'PG', 'Lead Scorer Guard', 'Scores at all three levels with a dangerous handle.', { mid: 18, three: 16, handle: 14, inside: 10, ft: 8 }, { Offense: 0.8, Mental: 1.1, Rebounding: 1.25 }),
  A('pg-shooter', 'PG', 'Pure Shooter', 'Lethal from deep and at the line. A stand-still specialist.', { three: 28, ft: 16, mid: 12 }, { Offense: 0.8, Athletic: 1.1, Defense: 1.15 }),
  A('pg-pest', 'PG', 'Pesky Pickpocket', 'Quick hands and speed on defense. Forces turnovers all night.', { speed: 24, perD: 18, steal: 18, stam: 8 }, { Athletic: 0.8, Defense: 0.85, Offense: 1.2 }),
  A('pg-twoway', 'PG', 'Two-Way Point', 'Balanced on both ends. A dependable starter in any system.', { perD: 12, pass: 12, handle: 12, three: 10, iq: 8 }, { Mental: 0.9 }),
  A('pg-maestro', 'PG', 'Pick-and-Roll Maestro', 'Attacks the rim and dishes to the big. Lives in the pick-and-roll.', { pass: 16, vision: 14, inside: 16, handle: 12 }, { Offense: 0.8, Rebounding: 1.2 }),
  A('pg-driver', 'PG', 'Dribble-Drive Creator', 'Explosive first step and relentless rim pressure.', { handle: 16, speed: 18, inside: 14, ft: 12 }, { Athletic: 0.85, Offense: 0.9, Defense: 1.2 }),
  A('pg-lockdown', 'PG', 'Defensive Quarterback', 'High basketball IQ and disruptive perimeter defense.', { iq: 18, perD: 18, steal: 12, vision: 12 }, { Defense: 0.8, Mental: 0.9, Offense: 1.2 }),
  // ---- Shooting Guards
  A('sg-sniper', 'SG', 'Sharpshooter', 'Elite off-ball shooter who lives on the perimeter.', { three: 30, mid: 12, ft: 10, hustle: 6 }, { Offense: 0.8, Defense: 1.15 }),
  A('sg-bucket', 'SG', 'Bucket Getter', 'Polished all-around scoring game from every spot on the floor.', { inside: 14, mid: 16, handle: 12, three: 12, clutch: 8 }, { Offense: 0.85, Mental: 0.9, Rebounding: 1.3 }),
  A('sg-stopper', 'SG', 'Perimeter Stopper', 'Shuts down the opponent\'s best scorer every night.', { perD: 28, steal: 12, speed: 12, hustle: 10 }, { Defense: 0.75, Offense: 1.25 }),
  A('sg-slasher', 'SG', 'Slashing Wing', 'Explosive driver who finishes through contact.', { speed: 20, vert: 16, inside: 18, ft: 10 }, { Athletic: 0.8, Defense: 1.2 }),
  A('sg-cutter', 'SG', 'Off-Ball Cutter', 'Relentless motor. Runs the baseline and crashes the glass.', { hustle: 22, speed: 16, three: 12, iq: 10 }, { Mental: 0.8, Athletic: 0.9, Rebounding: 1.15 }),
  A('sg-combo', 'SG', 'Combo Guard', 'Can run the point in a pinch and score in bunches.', { handle: 10, pass: 10, three: 12, mid: 10 }, { Rebounding: 1.25 }),
  A('sg-twoway', 'SG', 'Two-Way Wing', 'Reliable shooter who can defend one through four.', { three: 14, perD: 14, iq: 8, hustle: 6 }, { Defense: 0.9, Rebounding: 1.2 }),
  A('sg-clutch', 'SG', 'Clutch Gunner', 'Ice in the veins when the game is on the line.', { clutch: 28, three: 16, iq: 8 }, { Mental: 0.75, Defense: 1.2, Athletic: 1.1 }),
  // ---- Small Forwards
  A('sf-3d', 'SF', 'Three-and-D Wing', 'Corner three specialist with versatile perimeter defense.', { three: 18, perD: 18, hustle: 8, iq: 8 }, { Defense: 0.8, Offense: 0.9 }),
  A('sf-point', 'SF', 'Point Forward', 'Initiates the offense from the wing with elite passing.', { pass: 20, vision: 18, handle: 12, drb: 10, iq: 10 }, { Offense: 0.8, Rebounding: 1.2 }),
  A('sf-finisher', 'SF', 'Athletic Finisher', 'Highlight dunker with explosive leaping ability.', { vert: 25, speed: 15, inside: 15, str: 8 }, { Athletic: 0.75 }),
  A('sf-stretch', 'SF', 'Stretch Forward', 'Floor-spacing wing who can pull up from anywhere.', { three: 22, mid: 12, ft: 10, drb: 5 }, { Offense: 0.85, Rebounding: 1.2 }),
  A('sf-glue', 'SF', 'Glue Guy', 'Does the little things: hustle, boards, and steals.', { hustle: 25, steal: 12, drb: 10, iq: 10 }, { Mental: 0.75, Athletic: 0.95, Offense: 1.25 }),
  A('sf-versatile', 'SF', 'Versatile Wing', 'A little bit of everything with no glaring weakness.', { inside: 10, three: 10, perD: 10, iq: 10, pass: 8 }, { Mental: 0.9 }),
  A('sf-stopper', 'SF', 'Lockdown Stopper', 'Physical defender who blocks shots and jumps passing lanes.', { perD: 20, intD: 10, steal: 14, block: 10, speed: 12 }, { Defense: 0.8, Offense: 1.25 }),
  A('sf-iron', 'SF', 'Iron Wing', 'Strong and tireless. Bullies smaller defenders in the paint.', { str: 25, inside: 15, drb: 10, stam: 12 }, { Athletic: 0.8, Mental: 1.1 }),
  // ---- Power Forwards
  A('pf-stretch', 'PF', 'Stretch Four', 'Pulls the defense out of the paint and shoots from three.', { three: 22, mid: 15, ft: 12, intD: 5 }, { Offense: 0.8, Defense: 1.15 }),
  A('pf-crasher', 'PF', 'Board Crasher', 'Relentless rebounder who dominates the glass.', { orb: 25, drb: 22, str: 12, hustle: 10 }, { Rebounding: 0.75, Offense: 1.2 }),
  A('pf-rim', 'PF', 'Rim Protector', 'Intimidating interior defender who erases shots.', { block: 25, intD: 25, vert: 10, iq: 8 }, { Defense: 0.75, Offense: 1.25 }),
  A('pf-post', 'PF', 'Post Scorer', 'Dominant in the paint with polished footwork.', { inside: 28, str: 12, ft: 10 }, { Offense: 0.8, Defense: 1.2 }),
  A('pf-screen', 'PF', 'Pick-and-Roll Big', 'Sets bruising screens and rolls hard to the rim.', { inside: 15, pass: 12, vision: 10, handle: 6 }, { Offense: 0.85, Athletic: 1.1 }),
  A('pf-energy', 'PF', 'Energy Big', 'Non-stop motor with great stamina and hustle plays.', { hustle: 25, stam: 20, orb: 12 }, { Mental: 0.8, Athletic: 0.85 }),
  A('pf-twoway', 'PF', 'Two-Way Forward', 'Solid on both ends with no real weaknesses.', { inside: 10, intD: 10, drb: 10, iq: 8 }, { Mental: 0.9 }),
  A('pf-enforcer', 'PF', 'Enforcer', 'Strong, physical, and not afraid of contact.', { str: 28, intD: 15, hustle: 10 }, { Athletic: 0.8, Defense: 0.85 }),
  // ---- Centers
  A('c-trad', 'C', 'Traditional Center', 'Anchors the paint on both ends of the floor.', { inside: 18, intD: 20, drb: 20, orb: 15, block: 10 }, { Rebounding: 0.8, Defense: 0.85 }),
  A('c-rim', 'C', 'Rim Protector', 'Shot-blocking anchor who controls the paint.', { block: 28, intD: 20, vert: 15 }, { Defense: 0.75, Offense: 1.25 }),
  A('c-stretch', 'C', 'Stretch Five', 'Pick-and-pop big who spaces the floor.', { three: 22, mid: 12, ft: 12, drb: 10 }, { Offense: 0.8, Rebounding: 1.2 }),
  A('c-hub', 'C', 'Passing Hub', 'High-post playmaker who sees the whole floor.', { pass: 18, vision: 18, iq: 12, intD: 8 }, { Mental: 0.8, Offense: 0.9 }),
  A('c-boards', 'C', 'Rebounding Machine', 'Among the best glass cleaners in the league.', { drb: 28, orb: 22, str: 12 }, { Rebounding: 0.7, Offense: 1.25 }),
  A('c-athletic', 'C', 'Athletic Big', 'Explosive vertical and rim-running in transition.', { vert: 25, speed: 12, orb: 12, str: 8 }, { Athletic: 0.8 }),
  A('c-post', 'C', 'Post Anchor', 'Bruising interior scorer who dominates with strength.', { inside: 20, str: 20, iq: 12, ft: 8 }, { Offense: 0.85, Athletic: 1.05 }),
  A('c-iq', 'C', 'Defensive Anchor', 'High-IQ rim defender who reads every play before it happens.', { iq: 18, intD: 18, block: 12, steal: 6, drb: 10 }, { Defense: 0.8, Mental: 0.9 }),
];

// ----- Pay curve -----
// Pay per game rises by the same factor for every Overall point and every league, so each
// +1 Overall takes about the same time in all ten leagues. Overall runs 50 to 99 in each league
// (index = 50 * league + (Overall - 50)). The endgame GOAT (league 9, Overall 99) pays PAY.endgame.
export const PAY = { start: 30, endgame: 725000 };
export const PAY_STEP = Math.pow(PAY.endgame / PAY.start, 1 / (50 * 9 + 49));
export const leagueMult = (i) => Math.pow(PAY_STEP, 50 * i);

// Coin cost of one rating point: COST.base * catMult * corePremium * leagueMult * growth^(value - offset)
// growth and league use the pay step, so prices climb exactly as fast as pay.
export const COST = { base: 90, growth: PAY_STEP, offset: START_OVERALL, leagueExp: 1, corePerWeight: 0.25 };

export const LEAGUES = [
  { id: 'gl', name: 'G League', coinMult: leagueMult(0), teamOvr: 52, mvpMu: 21.0,
    teams: ['Rio Grande Vipers', 'Motor City Rockers', 'Sioux Falls Storm', 'Westchester Wolves', 'Long Island Lightning', 'Salt Lake Summit', 'Birmingham Iron', 'Toronto Ridge'] },
  { id: 'nba', name: 'NBA', coinMult: leagueMult(1), teamOvr: 60, mvpMu: 19.5,
    teams: ['Boston Harbor', 'Chicago Forge', 'Denver Peaks', 'Miami Tide', 'Phoenix Mesa', 'Seattle Pines', 'Atlanta Crown', 'Dallas Mesa'] },
  { id: 'euro', name: 'EuroLeague Elite', coinMult: leagueMult(2), teamOvr: 66, mvpMu: 18.5,
    teams: ['Madrid Royals', 'Milan Bolts', 'Belgrade Eagles', 'Athens Titans', 'Istanbul Crescent', 'Munich Alpine', 'Paris Lumiere', 'Vilnius Storm'] },
  { id: 'pac', name: 'Pacific Rim Pro', coinMult: leagueMult(3), teamOvr: 69, mvpMu: 18.0,
    teams: ['Kyoto Blaze', 'Melbourne Reef', 'Seoul Comets', 'Auckland Gales', 'Manila Typhoons', 'Osaka Ironclads', 'Perth Current', 'Taipei Dragons'] },
  { id: 'world', name: 'World Superleague', coinMult: leagueMult(4), teamOvr: 72, mvpMu: 17.5,
    teams: ['Tokyo Thunder', 'Sydney Surge', 'Dubai Oasis', 'Lagos Kings', 'Rio Sol', 'Shanghai Dragons', 'Cairo Pyramids', 'Mumbai Monsoon'] },
  { id: 'cont', name: 'Continental Crown', coinMult: leagueMult(5), teamOvr: 74, mvpMu: 17.0,
    teams: ['Andes Condors', 'Sahara Lions', 'Nordic Frost', 'Pacific Tide', 'Atlas Mountain', 'Caspian Wolves', 'Savanna Kings', 'Alpine Bears'] },
  { id: 'olymp', name: 'Olympus Circuit', coinMult: leagueMult(6), teamOvr: 76, mvpMu: 16.5,
    teams: ['Mount Athens', 'Thunder Peaks', 'Delphi Oracles', 'Pantheon Guard', 'Aegis Spartans', 'Ares Blades', 'Hermes Wings', 'Helios Suns'] },
  { id: 'legend', name: 'Legends League', coinMult: leagueMult(7), teamOvr: 78, mvpMu: 16.0,
    teams: ['Olympus Gods', 'Eternal Flame', 'Titan Crown', 'Starfall Kings', 'Mythos Legends', 'Apex Immortals', 'Zenith Dynasty', 'Sovereign Stars'] },
  { id: 'hall', name: 'Hall of Fame Circuit', coinMult: leagueMult(8), teamOvr: 80, mvpMu: 15.5,
    teams: ['Springfield Legends', 'Canton Immortals', 'Cooperstown Greats', 'Naismith Aces', 'Hoops Pantheon', 'Retired Numbers', 'Rafter Kings', 'Cathedral Five'] },
  { id: 'immortal', name: 'Immortal League', coinMult: leagueMult(9), teamOvr: 82, mvpMu: 15.0,
    teams: ['Eternal Throne', 'Celestial Hoops', 'Mythic Court', 'Timeless Crown', 'Ascendant Five', 'Infinite Rim', 'Legacy Prime', 'The Pantheon'] },
];

// Contract tiers keyed by Overall. base = coins per game at 30 minutes in the G League.
export const CONTRACTS = [
  { name: 'Two-Way Deal',     minOvr: 0 },
  { name: 'Bench Deal',       minOvr: 60 },
  { name: 'Rotation Deal',    minOvr: 64 },
  { name: 'Starter Deal',     minOvr: 68 },
  { name: 'Max Starter',      minOvr: 72 },
  { name: 'All-Star Deal',    minOvr: 76 },
  { name: 'Superstar Deal',   minOvr: 80 },
  { name: 'MVP Max',          minOvr: 86 },
  { name: 'Legend Deal',      minOvr: 92 },
  { name: 'GOAT Deal',        minOvr: 97 },
];

// Side income (scales with rating and overall)
// Side income is a share of what a typical game pays at your contract tier
// rate: fraction of a 30-minute game; avg rating is measured against 60
export const TRAINING = { cooldownSec: 45, rate: 0.15 };
export const ADS = { minGapSec: 40, maxGapSec: 80, windowSec: 20, rate: 0.4 };
// Side income is a share of the current contract base (which already tracks Overall).
// Ascension legacy multiplier applies, as it does to games.
export const SIDE_FLOOR = 40;   // Overall where contract-based side income starts
export const SIDE_RATE = { ad: 0.25, drill: 0.10 };   // fraction of contract base per payout

// Investments are bought with coins and have no level cap. Each level of sponsor or drill pay compounds,
// and its cost is paybackPayouts times the payout it adds at the new level, so every level pays back in
// the same number of ads/drills in any league. Away Speed's cost is paybackHours of the extra away pay it adds.
export const INVEST = {
  agency:  { payMult: 0.35, speed: 0.06, paybackPayouts: 60 },   // ads: payout x1.35 per level; offer gap divided by (1 + 0.06 x level)
  trainer: { payMult: 0.30, speed: 0.06, paybackPayouts: 60 },   // drills: payout x1.30 per level; cooldown divided by (1 + 0.06 x level)
  idle:    { base: 0.5, max: 1, pace: 0.01, paybackHours: 1, gameSec: 20, costGrowth: 0.06, maxLevel: 50, timeBaseMin: 120, timeStepMin: 12 }, // away games: pace starts at 0.5x, +0.01 per level, capped at 1x; max away time starts at 2h, +12 min per level, capped at 50 levels (12h)
};

// Clutch time: in a close game entering Q4, one bonus per game. Scales with contract base and the Clutch rating.
export const CLUTCH = { rate: 0.4, closeMargin: 6 };

// Daily objectives reset at local midnight. Each category is an uncapped ladder (1st, 2nd, 3rd... each day).
// Payout = contract base x rate x (1 + step x objectives completed today).
// Not affected by investments.
export const DAILY = {
  rate: 0.4,
  step: 0.1,
  // Stat ladders: tier n uses entry n (the last entry repeats). One qualifying game per tier.
  statLadders: {
    pts: [10, 15, 20, 25, 30, 35, 40, 45, 50],
    ast: [5, 8, 10, 12, 15, 20, 25],
    reb: [5, 10, 15, 20, 25, 30],
    def: [2, 3, 4, 5, 6, 7, 8, 9, 10],   // steals or blocks, per archetype
    tpm: [2, 3, 4, 5, 6, 7, 8],
  },
};

export const AWAY_EARN_MULT = 1;      // games played while away (tab hidden, idle, or offline) pay full; they run at 0.5x pace (AWAY_PACE)
export const AD_SPONSORS = ['Hoopline Sneakers', 'Turbo Energy Drink', 'Metro Auto Group', 'Court Cola', 'Skyline Bank', 'Glide Razors', 'Pulse Wearables', 'Orbit Airlines'];

export const FIRST_NAMES = ['Marcus', 'Jaylen', 'Devin', 'Tre', 'Kobe', 'Malik', 'Trey', 'Andre', 'Cam', 'Dorian', 'Jalen', 'Zion'];
export const LAST_NAMES = ['Brooks', 'Hayes', 'Vaughn', 'Mitchell', 'Reeves', 'Carter', 'Sterling', 'Ellis', 'Monroe', 'Hart', 'Dawson', 'Price'];
