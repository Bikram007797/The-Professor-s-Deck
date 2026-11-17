// Pure, UI-free Top Trumps engine. Same code runs in browser, practice mode and Cloud Functions.
// State is plain JSON (Firebase-safe). Animations never decide results: they only replay events.
import { ATTRIBUTES } from "./cards.js";

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// players: array of ids (V1 uses 2; engine supports N for future 3-4 player modes)
export function createGame({ cardIds, players, seed = Date.now(), firstPlayer }) {
  if (new Set(cardIds).size !== cardIds.length) throw new Error("Duplicate card ids");
  if (cardIds.length % players.length) throw new Error("Cards must divide evenly");
  const rng = mulberry32(seed), deal = shuffle(cardIds, rng), per = cardIds.length / players.length;
  const decks = {};
  players.forEach((p, i) => (decks[p] = deal.slice(i * per, (i + 1) * per)));
  return {
    players: players.slice(), total: cardIds.length, decks, pot: [],
    active: firstPlayer ?? players[Math.floor(rng() * players.length)],
    round: 1, roundId: "r1", status: "playing", winner: null, tieStreak: 0,
    stats: Object.fromEntries(players.map(p => [p, { roundsWon: 0, cats: {} }])),
  };
}

// What a client may see: own top card, opponent counts only (never opponent deck order).
export function viewFor(state, pid) {
  return {
    me: pid, active: state.active, round: state.round, roundId: state.roundId, status: state.status, winner: state.winner,
    myTop: state.decks[pid][0] ?? null, myCount: state.decks[pid].length,
    counts: Object.fromEntries(state.players.map(p => [p, state.decks[p].length])),
    potCount: state.pot.length, tieStreak: state.tieStreak,
  };
}

export class EngineError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// Pure: returns { state, event }. valueOf(cardId, category) -> number
export function playRound(state, { playerId, category, roundId }, valueOf) {
  if (state.status !== "playing") throw new EngineError("over", "Match is over");
  if (roundId !== state.roundId) throw new EngineError("stale", "Stale or duplicate round");
  if (playerId !== state.active) throw new EngineError("not-active", "Not your turn to select");
  if (!ATTRIBUTES.includes(category)) throw new EngineError("bad-category", "Invalid category");

  const s = JSON.parse(JSON.stringify(state));
  const played = {};
  for (const p of s.players) {
    if (!s.decks[p].length) throw new EngineError("empty", "Player has no cards");
    played[p] = s.decks[p].shift();
  }
  const vals = Object.fromEntries(s.players.map(p => [p, valueOf(played[p], category)]));
  const max = Math.max(...Object.values(vals));
  const top = s.players.filter(p => vals[p] === max);
  s.stats[playerId].cats[category] = (s.stats[playerId].cats[category] || 0) + 1;

  const event = { roundId: state.roundId, round: state.round, selector: playerId, category, played, values: vals, potBefore: state.pot.length };
  const playedCards = s.players.map(p => played[p]);

  if (top.length > 1) {
    // TIE: played cards join the pot, same selector continues
    s.pot.push(...playedCards);
    s.tieStreak++;
    event.result = "tie"; event.winner = null;
    const empty = s.players.filter(p => !s.decks[p].length);
    if (empty.length) finish(s, empty, event); // someone cannot continue the tie
  } else {
    const w = top[0], losers = s.players.filter(p => p !== w);
    // pot first, then winner's card, then the others — deterministic order
    s.decks[w].push(...s.pot, played[w], ...losers.map(p => played[p]));
    event.result = "win"; event.winner = w; event.collected = [...s.pot, ...playedCards];
    s.pot = []; s.tieStreak = 0; s.active = w; s.stats[w].roundsWon++;
    const empty = s.players.filter(p => !s.decks[p].length);
    if (empty.length) finish(s, empty, event);
  }
  s.round++; s.roundId = "r" + s.round;
  event.after = { counts: Object.fromEntries(s.players.map(p => [p, s.decks[p].length])), pot: s.pot.length, status: s.status, winner: s.winner };
  assertIntegrity(s);
  return { state: s, event };
}

function finish(s, emptyPlayers, event) {
  const alive = s.players.filter(p => !emptyPlayers.includes(p));
  event.eliminated = emptyPlayers;
  if (alive.length === 1) { // last player standing takes any pot
    const w = alive[0]; s.decks[w].push(...s.pot); s.pot = [];
    s.status = "finished"; s.winner = w;
  } else if (alive.length === 0) { s.status = "finished"; s.winner = null; } // simultaneous exhaustion in a tie = draw
  // N>2: eliminated players are skipped by caller (future); V1 is 2 players
}

// Disconnect timeout: opponent forfeits, match never gets stuck.
export function forfeit(state, loserId) {
  const s = JSON.parse(JSON.stringify(state));
  const w = s.players.find(p => p !== loserId);
  s.decks[w].push(...s.pot, ...s.decks[loserId]); s.decks[loserId] = []; s.pot = [];
  s.status = "finished"; s.winner = w; s.forfeit = loserId;
  assertIntegrity(s);
  return s;
}

export function assertIntegrity(s) {
  const all = [...Object.values(s.decks).flat(), ...s.pot];
  if (all.length !== s.total) throw new Error(`Integrity: ${all.length} cards, expected ${s.total}`);
  if (new Set(all).size !== all.length) throw new Error("Integrity: duplicate card");
}

// ---- AI (practice mode). Sees only its own top card. ----
export function aiChoose(topCardId, valueOf, difficulty = "normal", rng = Math.random) {
  const ranked = ATTRIBUTES.map(c => [c, valueOf(topCardId, c)]).sort((a, b) => b[1] - a[1]);
  if (difficulty === "easy") return ATTRIBUTES[Math.floor(rng() * 6)];
  if (difficulty === "normal") return ranked[Math.min(Math.floor(rng() * 3), 2)][0]; // one of its best 3
  return ranked[0][0];
}
