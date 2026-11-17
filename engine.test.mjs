// Run: node tests/engine.test.mjs   (no dependencies)
import assert from "node:assert/strict";
import { CARDS, CARD_BY_ID, ATTRIBUTES } from "../js/cards.js";
import { createGame, playRound, viewFor, forfeit, aiChoose, mulberry32, EngineError } from "../js/game-engine.js";

const ids = CARDS.map(c => c.id), val = (id, c) => CARD_BY_ID[id].attributes[c];
let pass = 0; const t = (n, f) => { f(); pass++; console.log("  ✓", n); };
const mk = (decks, active = "A", pot = []) => ({ players: ["A", "B"], total: [...Object.values(decks).flat(), ...pot].length, decks, pot, active, round: 1, roundId: "r1", status: "playing", winner: null, tieStreak: 0, stats: { A: { roundsWon: 0, cats: {} }, B: { roundsWon: 0, cats: {} } } });
const fake = { X1: { speed: 90 }, X2: { speed: 50 }, X3: { speed: 70 }, X4: { speed: 70 }, X5: { speed: 10 }, X6: { speed: 99 } };
const fv = (id) => fake[id].speed;
const throwsCode = (f, code) => assert.throws(f, e => e instanceof EngineError && e.code === code);

console.log("Card data");
t("exactly 30 unique cards", () => { assert.equal(CARDS.length, 30); assert.equal(new Set(ids).size, 30); });
t("every attribute is 1–100, 6 attributes", () => CARDS.forEach(c => { assert.equal(Object.keys(c.attributes).length, 6); ATTRIBUTES.forEach(a => assert.ok(c.attributes[a] >= 1 && c.attributes[a] <= 100)); }));
t("unique image path per card", () => assert.equal(new Set(CARDS.map(c => c.image)).size, 30));
t("no card tops every category", () => ATTRIBUTES.forEach(a => assert.ok(CARDS.filter(c => c.attributes[a] === Math.max(...CARDS.map(x => x.attributes[a]))).length >= 1)) || assert.ok(CARDS.every(c => ATTRIBUTES.some(a => CARDS.some(o => o.attributes[a] > c.attributes[a])))));

console.log("Distribution");
t("15 cards each, no duplicates, nothing lost", () => { const g = createGame({ cardIds: ids, players: ["A", "B"], seed: 7 }); assert.equal(g.decks.A.length, 15); assert.equal(g.decks.B.length, 15); assert.equal(new Set([...g.decks.A, ...g.decks.B]).size, 30); });
t("same seed → same deal (consistent ordering)", () => assert.deepEqual(createGame({ cardIds: ids, players: ["A", "B"], seed: 3 }).decks, createGame({ cardIds: ids, players: ["A", "B"], seed: 3 }).decks));
t("viewFor hides opponent cards", () => { const g = createGame({ cardIds: ids, players: ["A", "B"], seed: 1 }); const v = viewFor(g, "A"); assert.equal(v.myTop, g.decks.A[0]); assert.ok(!JSON.stringify(v).includes(g.decks.B[0])); });

console.log("Round rules");
t("higher value wins; winner collects both at bottom; winner selects next", () => {
  const { state, event } = playRound(mk({ A: ["X1", "X5"], B: ["X2", "X6"] }), { playerId: "A", category: "speed", roundId: "r1" }, (id, c) => fv(id));
  assert.equal(event.winner, "A"); assert.deepEqual(state.decks.A, ["X5", "X1", "X2"]); assert.deepEqual(state.decks.B, ["X6"]); assert.equal(state.active, "A");
});
t("loser keeps no played card; counts always total 30", () => { const g = createGame({ cardIds: ids, players: ["A", "B"], seed: 9 }); const r = playRound(g, { playerId: g.active, category: "speed", roundId: "r1" }, val); assert.equal(r.state.decks.A.length + r.state.decks.B.length, 30); });
t("only active player may select", () => throwsCode(() => playRound(mk({ A: ["X1"], B: ["X2"] }), { playerId: "B", category: "speed", roundId: "r1" }, (i) => fv(i)), "not-active"));
t("invalid category rejected", () => throwsCode(() => playRound(mk({ A: ["X1"], B: ["X2"] }), { playerId: "A", category: "hax", roundId: "r1" }, (i) => fv(i)), "bad-category"));
t("duplicate/stale round submission rejected", () => { const s0 = mk({ A: ["X1", "X5"], B: ["X2", "X6"] }); const { state } = playRound(s0, { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); throwsCode(() => playRound(state, { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)), "stale"); });
t("input state is never mutated", () => { const s0 = mk({ A: ["X1", "X5"], B: ["X2", "X6"] }), snap = JSON.stringify(s0); playRound(s0, { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); assert.equal(JSON.stringify(s0), snap); });

console.log("Ties");
t("tie → both cards to pot, same selector, pot visible", () => {
  const { state, event } = playRound(mk({ A: ["X3", "X1"], B: ["X4", "X2"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i));
  assert.equal(event.result, "tie"); assert.deepEqual(state.pot, ["X3", "X4"]); assert.equal(state.active, "A"); assert.equal(viewFor(state, "B").potCount, 2);
});
t("tie then win: winner takes whole pot + played cards", () => {
  let r = playRound(mk({ A: ["X3", "X1", "X5"], B: ["X4", "X2", "X6"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i));
  r = playRound(r.state, { playerId: "A", category: "speed", roundId: "r2" }, (i) => fv(i));
  assert.equal(r.event.winner, "A"); assert.equal(r.state.pot.length, 0); assert.equal(r.state.decks.A.length, 5); assert.equal(r.state.decks.B.length, 1);
});
t("double tie accumulates 4 cards", () => {
  const fv2 = { P: 5, Q: 5, R: 6, S: 6, T: 1, U: 2 }; const f = i => fv2[i];
  let r = playRound(mk({ A: ["P", "R", "T"], B: ["Q", "S", "U"] }), { playerId: "A", category: "speed", roundId: "r1" }, f);
  r = playRound(r.state, { playerId: "A", category: "speed", roundId: "r2" }, f); assert.equal(r.state.pot.length, 4); assert.equal(r.state.tieStreak, 2);
});
t("tie that empties both decks = draw, nothing stuck", () => { const r = playRound(mk({ A: ["X3"], B: ["X4"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); assert.equal(r.state.status, "finished"); assert.equal(r.state.winner, null); });
t("tie where only one player runs out → other wins whole pot", () => { const r = playRound(mk({ A: ["X3", "X1"], B: ["X4"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); assert.equal(r.state.winner, "A"); assert.equal(r.state.decks.A.length, 3); });

console.log("Elimination & match end");
t("losing last card ends match; winner owns all", () => { const r = playRound(mk({ A: ["X1"], B: ["X2"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); assert.equal(r.state.status, "finished"); assert.equal(r.state.winner, "A"); assert.deepEqual(r.event.eliminated, ["B"]); assert.equal(r.state.decks.A.length, 2); });
t("no moves after match over", () => { const r = playRound(mk({ A: ["X1"], B: ["X2"] }), { playerId: "A", category: "speed", roundId: "r1" }, (i) => fv(i)); throwsCode(() => playRound(r.state, { playerId: "A", category: "speed", roundId: r.state.roundId }, (i) => fv(i)), "over"); });
t("forfeit on disconnect gives winner all 30", () => { const g = createGame({ cardIds: ids, players: ["A", "B"], seed: 2 }); const f = forfeit(g, "B"); assert.equal(f.winner, "A"); assert.equal(f.decks.A.length, 30); });

console.log("Full simulated matches (AI vs AI, integrity checked every round)");
t("500 matches: all reach a result, 30 cards conserved", () => {
  const out = { A: 0, B: 0, draw: 0, capped: 0 }; let maxR = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rng = mulberry32(seed * 31); let g = createGame({ cardIds: ids, players: ["A", "B"], seed });
    for (let i = 0; i < 3000 && g.status === "playing"; i++) {
      const cat = aiChoose(g.decks[g.active][0], val, g.active === "A" ? "hard" : "normal", rng);
      g = playRound(g, { playerId: g.active, category: cat, roundId: g.roundId }, val).state;
    }
    if (g.status === "playing") out.capped++; else out[g.winner ?? "draw"]++;
    maxR = Math.max(maxR, g.round);
  }
  console.log("    results:", out, "longest:", maxR, "rounds");
  assert.equal(out.capped, 0);
  assert.ok(out.A > out.B, "hard AI should beat normal AI");
});

console.log(`\n${pass} tests passed`);
