import { CARDS } from "./cards.js";
const ICON={intelligence:"◆",strategy:"♜",speed:"➤",stealth:"◐",negotiation:"✦",execution:"✖"};
const MED={C:"C",R:"R",E:"E",L:"LGD"};

/* original placeholder art: red jumpsuit + white mask silhouette, unique per card */
function art(c,n){
 const h=(n*47)%360,x=(n*13)%30-15;
 return `<svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice"><defs>
 <radialGradient id="b${n}" cx="50%" cy="40%"><stop offset="0" stop-color="hsl(${350+h%20},80%,45%)"/><stop offset="1" stop-color="#150003"/></radialGradient></defs>
 <rect width="200" height="260" fill="url(#b${n})"/>
 <g fill="none" stroke="rgba(255,255,255,.12)" stroke-width="3">${[30,60,90,120].map(r=>`<circle cx="${100+x}" cy="110" r="${r}"/>`).join("")}</g>
 <path d="M${40+x} 260 Q${50+x} 170 100 165 Q${150-x} 170 ${160+x} 260Z" fill="#c4101f"/>
 <path d="M${100+x/2} 165 v95" stroke="#6b0710" stroke-width="3"/>
 <ellipse cx="${100+x/2}" cy="105" rx="30" ry="40" fill="#f2efe6"/>
 <path d="M${82+x/2} 92 q8 -6 14 0 M${106+x/2} 92 q8 -6 14 0" stroke="#111" stroke-width="3" fill="none"/>
 <path d="M${88+x/2} 128 q12 8 24 0" stroke="#111" stroke-width="3" fill="none"/>
 <path d="M${96+x/2} 100 q4 10 8 0" stroke="#111" stroke-width="2" fill="none"/>
 <path d="M${70+x/2} 70 q30 -34 60 0" fill="#1b1b1f"/></svg>`;
}
function cardHTML(c,n){
 const pills=Object.entries(c.attributes).map(([k,v])=>`<div class="pill" data-k="${k}"><i>${ICON[k]}</i>${k.slice(0,3).toUpperCase()}<b>${v}</b><s style="width:${v}%"></s></div>`).join("");
 return `<div class="scene"><div class="inner">
 <div class="face card"><div class="frame">
  <div class="top"><div class="seal"></div><div class="name">${c.name}</div><div class="medal ${c.rarity[0].toLowerCase()}">${MED[c.rarity[0]]}</div></div>
  <div class="art"><img loading="lazy" alt="${c.name}" src="${c.image}" onerror="this.outerHTML=window.__art(${n})"><div class="shine"></div></div>
  <div class="stats">${pills}</div>
  <div class="scroll">${c.bio}</div><div class="id">${c.id} · ${c.rarity.toUpperCase()}</div>
 </div></div>
 <div class="face card back"><div class="frame">
  <svg class="mask" viewBox="0 0 100 130"><ellipse cx="50" cy="60" rx="36" ry="50" fill="#f2efe6"/><path d="M30 45q8-7 16 0M54 45q8-7 16 0M38 82q12 10 24 0" stroke="#111" stroke-width="4" fill="none"/></svg>
  <h2>THE PROFESSOR'S DECK</h2></div></div>
 </div></div>`;
}
window.__art=n=>art(CARDS[n],n);
export const cardFace=id=>{const i=CARDS.findIndex(c=>c.id===id);return cardHTML(CARDS[i],i)};
export { cardHTML };
