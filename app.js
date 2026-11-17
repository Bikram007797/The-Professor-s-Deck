import { CARDS, CARD_BY_ID, ATTRIBUTES } from "./cards.js";
import { createGame, playRound, aiChoose } from "./game-engine.js";
import { cardFace } from "./card-view.js";

const $ = s => document.querySelector(s);
const val = (id, c) => CARD_BY_ID[id].attributes[c];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ME = "A", AI = "B";

/* ---------- navigation ---------- */
function go(name) {
  document.querySelectorAll(".screen").forEach(s => (s.hidden = s.id !== "s-" + name));
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.go === name));
  $("#app").scrollTop = 0;
}
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) return go(g.dataset.go);
  const a = e.target.closest("[data-ai]"); if (a) return startPractice(a.dataset.ai);
  const s = e.target.closest("#grid .scene"); if (s) s.classList.toggle("flip");
});
$("#grid").innerHTML = CARDS.map(c => cardFace(c.id)).join("");

/* practice record: local only, never mixed with verified online stats */
const REC = "pd.practice";
const rec = () => { try { return JSON.parse(localStorage.getItem(REC)) || { w: 0, l: 0, d: 0 }; } catch { return { w: 0, l: 0, d: 0 }; } };
const showRec = () => { const r = rec(); $("#record").textContent = r.w + r.l + r.d ? `Practice record: ${r.w}W · ${r.l}L · ${r.d}D (local only)` : ""; };
const saveRec = k => { try { const r = rec(); r[k]++; localStorage.setItem(REC, JSON.stringify(r)); } catch {} showRec(); };
showRec();

/* ---------- practice gameplay ---------- */
let g, diff, picked, busy, runId = 0;

function startPractice(d) {
  diff = d; runId++; busy = false; picked = null;
  g = createGame({ cardIds: CARDS.map(c => c.id), players: [ME, AI] });
  const el = $("#game"); el.hidden = false;
  el.innerHTML = `
   <div class="gtop"><button id="quit" aria-label="Quit">✕</button><span id="rnd"></span><span>${d.toUpperCase()}</span></div>
   <div class="opp"><div class="pcount" id="oc"></div><div class="pot" id="pot" hidden></div></div>
   <div class="mid mine" id="mid"></div>
   <div class="opp"><div class="pcount" id="mc"></div></div>
   <div class="msg" id="msg"></div>
   <button class="btn big" id="confirm" disabled>Select a category</button>`;
  $("#quit").onclick = () => confirm("Quit this match?") && (runId++, el.hidden = true, go("play"));
  $("#confirm").onclick = submitMine;
  $("#mid").onclick = e => {
    const p = e.target.closest(".pill"); if (!p || busy || g.active !== ME || g.status !== "playing") return;
    picked = p.dataset.k;
    document.querySelectorAll("#mid .pill").forEach(x => x.classList.toggle("hi", x === p));
    const b = $("#confirm"); b.disabled = false; b.textContent = "Confirm: " + picked.toUpperCase();
  };
  render();
}

function render() {
  const mid = $("#mid"), mine = g.active === ME;
  $("#rnd").textContent = "Round " + g.round;
  $("#oc").textContent = "Opponent · " + g.decks[AI].length;
  $("#mc").textContent = "You · " + g.decks[ME].length;
  $("#oc").classList.toggle("act", !mine); $("#mc").classList.toggle("act", mine);
  const pot = $("#pot"); pot.hidden = !g.pot.length; pot.textContent = "Tie pot · " + g.pot.length;
  mid.innerHTML = cardFace(g.decks[ME][0]); // you only ever render your own top card
  mid.classList.toggle("locked", !mine);
  picked = null;
  const b = $("#confirm"); b.disabled = true; b.textContent = mine ? "Select a category" : "Opponent is selecting…";
  $("#msg").textContent = mine ? (g.tieStreak ? "Tie! Your turn again" : "Your turn") : "Opponent is selecting…";
  if (!mine) aiTurn();
}

async function aiTurn() {
  const id = runId; await sleep(1100); if (id !== runId) return;
  resolve(AI, aiChoose(g.decks[AI][0], val, diff));
}
function submitMine() { if (picked && !busy && g.active === ME) resolve(ME, picked); }

async function resolve(pid, category) {
  if (busy) return; busy = true; const id = runId;
  // 1) game state is decided immediately by the engine; 2) animation only replays the event
  const { state, event } = playRound(g, { playerId: pid, category, roundId: g.roundId }, val);
  $("#confirm").disabled = true;
  showReveal(event);
  await sleep(2600); if (id !== runId) return;
  g = state; busy = false;
  if (g.status === "finished") return finish();
  render();
}

function showReveal(ev) {
  const mid = $("#mid"), r = document.createElement("div"); r.className = "reveal";
  const cls = p => ev.result === "win" ? (ev.winner === p ? "win" : "lose") : "";
  const v = ev.result === "tie" ? ["tie", "TIE"] : ev.winner === ME ? ["win", "YOU WIN"] : ["lose", "YOU LOSE"];
  r.innerHTML = `
   <div class="tag">${ev.selector === ME ? "You chose" : "Opponent chose"} ${ev.category.toUpperCase()}</div>
   <div class="pair">${[ME, AI].map(p => cardFace(ev.played[p]).replace('class="scene"', `class="scene ${cls(p)}"`)).join("")}</div>
   <div class="verdict ${v[0]}">${v[1]}</div>
   <div class="tag">${ev.result === "tie" ? "Cards go to the tie pot" : "Winner collects the cards"}</div>`;
  r.querySelectorAll(".pill").forEach(p => p.classList.toggle("hi", p.dataset.k === ev.category));
  mid.appendChild(r);
  $("#msg").textContent = ev.result === "tie" ? "Tie round" : ev.winner === ME ? "You won the round" : "You lost the round";
}

function finish() {
  const won = g.winner === ME, draw = g.winner === null;
  saveRec(draw ? "d" : won ? "w" : "l");
  const o = document.createElement("div"); o.className = "over";
  o.innerHTML = `
   <div class="verdict ${draw ? "tie" : won ? "win" : "lose"}">${draw ? "DRAW" : won ? "VICTORY" : "DEFEAT"}</div>
   <p>${draw ? "Both decks ran out in a tie." : won ? "You hold all 30 cards." : "The opponent collected every card."}</p>
   <p class="sub">Rounds: ${g.round - 1} · You won ${g.stats[ME].roundsWon} · Opponent won ${g.stats[AI].roundsWon}<br>Practice result — not counted in online stats.</p>
   <button class="btn big" id="again">Rematch</button><button class="btn" id="home">Home</button>`;
  $("#game").appendChild(o);
  $("#again").onclick = () => startPractice(diff);
  $("#home").onclick = () => { $("#game").hidden = true; go("home"); };
}
