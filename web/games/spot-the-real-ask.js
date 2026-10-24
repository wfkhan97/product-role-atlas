/* Spot the real ask: a short excerpt from a real posting, one line at a time. Real ask or filler? The verdict comes
   in place with the skill and its share; "3 of 7 found" is the meter; the whole posting, coloured, ends the round,
   with the line you could put on a resume for each ask you found. Three postings (easy, medium, hard) make a run.
   Data: web/data/game_passages.json (pipeline/game_passages.py), the taxonomies for skill names, the index for
   field labels and meta.n_jobs, the evidence sentences for the resume lines. Nothing a player does leaves the
   browser: the best read, the last five runs and the passages seen stay in the games record (web/gameshell.js).
   Drawn in the shared shell: one header, 1 = real ask, 2 = filler, Enter goes on, Esc quits. No clock (PLAN.md v12,
   SRA1). Spec: games/spot-the-real-ask/README.md.
   UMD like skill-path.js: `logic` (the lines, the deal, the scoring; pure, no DOM) loads in node for
   evals/game_spot_scoring.mjs; the screens follow it. Registers window.Games["spot-the-real-ask"] = { mount }. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;   // node: require("web/games/spot-the-real-ask.js").logic
  else { root.Games = root.Games || {}; root.Games["spot-the-real-ask"] = { mount: mod.mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "spot-the-real-ask", TITLE = "Spot the real ask";
  const RULE = 2;   // the scoring rule saved runs were ranked under: 2 = half asks found, half filler let pass
  const DIFFICULTIES = ["easy", "medium", "hard"];
  const KEEP = { runs: 5, seen: 30 }, SAY = 3;
  const fmt = n => Number(n).toLocaleString();
  const pct = v => Math.round(v * 100) + "%";
  const shuffle = (a, rand = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- logic: pure, loads in node ----------
  // one passage's phrases in reading order, separators left out: what is judged and what is scored
  function chunksOf(p) {
    const out = [];
    for (const b of p.blocks) if (b.kind !== "gap") for (const c of b.chunks) if (c[1]) out.push({ text: c[0], label: c[1], skills: c[1] === "a" ? c[2] : [], share: c[1] === "a" ? c[3] : null, kind: c[1] === "f" ? c[2] : null, phrase: c[1] === "f" ? c[3] : null, counted: c[1] === "f" ? c[4] : null, countedShare: c[1] === "f" ? c[5] : null });
    return out;
  }
  // the lines a player judges: the ask and filler chunks, each with the bullet (or paragraph) it sits in. A bullet is
  // a list of [text, chunk index or null] pieces; `k` is the chunk's index in chunksOf(p). "Other" chunks (phrases the
  // atlas has no rule for) are never asked about: they are neutral and show as plain text.
  function linesOf(p) {
    const lines = []; let k = 0;
    for (const b of p.blocks) {
      if (b.kind === "gap") continue;
      const bullets = [[]];
      for (const c of b.chunks) {
        if (c[1] === null && c[0] === "\n") { bullets.push([]); continue; }
        const piece = [c[0], c[1] ? k : null, c[1] || null];
        if (c[1]) k++;
        bullets[bullets.length - 1].push(piece);
      }
      for (const bullet of bullets) for (const [, idx, label] of bullet) if (label === "a" || label === "f") lines.push({ k: idx, bullet });
    }
    const chunks = chunksOf(p);
    return lines.map(l => ({ ...chunks[l.k], k: l.k, bullet: l.bullet }));
  }
  // a run: easy, medium, hard; different roles and employers; from the pool given; passages not in `seen` first
  function deal(pool, seen = new Set(), rand = Math.random) {
    const fresh = pool.filter(p => !seen.has(p.id));
    const used = { roles: new Set(), companies: new Set() }, run = [];
    const take = (cands, d) => shuffle(cands.filter(c => (!d || c.difficulty === d) && !used.roles.has(c.role) && !used.companies.has(c.company)), rand)[0];
    for (const d of DIFFICULTIES) {
      const p = take(fresh, d) || take(pool, d) || take(fresh, null) || take(pool, null);
      if (!p) break;
      used.roles.add(p.role); used.companies.add(p.company); run.push(p);
    }
    return run;
  }
  // a posting's read weighs the two halves of the job equally: half the asks found, half the filler let pass.
  // No ask found reads 0.
  function readOf(found, asks, passed, filler) {
    if (!found || !asks) return 0;
    return 0.5 * found / asks + 0.5 * (filler ? passed / filler : 1);
  }
  // scoring: found, missed, false alarm, filler let pass; marks is a Set of chunk indexes called "real ask"
  function scoreMarks(chunks, marks) {
    const out = chunks.map((c, i) => {
      const marked = marks.has(i);
      const state = c.label === "a" ? (marked ? "found" : "missed") : c.label === "f" ? (marked ? "false" : "skipped") : "plain";
      return { ...c, marked, state };
    });
    const n = s => out.filter(c => c.state === s).length;
    const found = n("found"), missed = n("missed"), falses = n("false"), skipped = n("skipped");
    const asks = found + missed, filler = falses + skipped;
    return { chunks: out, found, missed, falses, skipped, asks, filler, read: readOf(found, asks, skipped, filler) };
  }
  // the line-by-line answers (Map of chunk index -> "ask" | "filler") as the marks the scorer reads
  const marksOf = answers => new Set([...answers].filter(([, v]) => v === "ask").map(([k]) => k));
  // the run's read is the mean over its postings
  const runRead = results => results.length ? results.reduce((a, r) => a + r.read, 0) / results.length : 0;

  const logic = { DIFFICULTIES, chunksOf, linesOf, deal, readOf, scoreMarks, marksOf, runRead };

  async function mount(el, ctx) {
    const { Atlas, game, esc } = ctx, GS = window.GameShell;
    let data, ix, generic, names, P = null;
    try {
      const [D, TM, TP, IX, GEN] = await Promise.all([Atlas.fetchJson("data/game_passages.json"), Atlas.fetchJson("data/taxonomy_mba.json"), Atlas.fetchJson("data/taxonomy.json"), Atlas.index(), Atlas.genericSkills()]);
      if (!D || !Array.isArray(D.passages) || !D.passages.length) throw new Error("no passages");
      data = D; ix = IX; generic = GEN;
      names = { mba: Object.fromEntries(TM.skills.map(s => [s.id, s])), product: Object.fromEntries(TP.skills.map(s => [s.id, s])) };
    } catch (e) {
      console.error(e);
      return comingSoon(el, game, esc);   // the data file did not load: the page play() shows for a game not built yet
    }
    Atlas.product().then(p => { P = p; }).catch(() => { });
    const INFO = GS.info({ rules: "A short excerpt from a real posting, one line at a time. Is the line a real ask or filler? The atlas's verdict comes at once, with the skill and the share of the role's postings that ask for it. The whole posting, coloured, ends the round. Three postings make a run: easy, medium, hard.", keys: "Keys: 1 says real ask, 2 says filler; Enter goes on; Esc quits.", source: "The asks and their shares come from the atlas's reading of the role's postings." });
    const F = GS.frame(el, { game: TITLE, cls: "sra", info: INFO });
    const S = { el, F, GS, esc, showAside: ctx.showAside, data, names, generic, nJobs: (ix.M && ix.M.meta && ix.M.meta.n_jobs) || data.n_jobs, field: "all", run: null, Atlas, ix, productOf: () => P };
    const have = new Set(data.passages.map(p => p.group));
    S.fields = ix.groups.filter(g => have.has(g.id)).map(g => [g.id, g.label]);
    // the default field: the profile's first field that has passages, else all fields
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    const mine = ((you && you.fields) || []).find(f => have.has(f)); if (mine) S.field = mine;
    S.offKeys = GS.keys({
      choose(n) { if (S.dead || S.phase !== "line" || n > 2) return false; judge(S, n === 1 ? "ask" : "filler"); return true; },
      confirm() { if (S.dead) return; if (S.phase === "start") startRun(S); else if (S.phase === "verdict") nextLine(S); else if (S.phase === "reveal") nextFromReveal(S); else if (S.phase === "end") startRun(S); },
    });
    window.addEventListener("hashchange", () => { S.dead = true; S.offKeys(); }, { once: true });
    S.showAside(null);
    howItWorks(S);
  }

  function comingSoon(el, game, esc) {
    el.innerHTML = `<div class="page narrow"><p class="eyebrow">Coming soon</p><h1>${esc(game.title)}</h1><p class="lead">${esc(game.tagline)}.</p>
      <div class="cover big"><img src="${esc(game.cover)}" alt="${esc(game.title)}, an early design" onerror="this.remove()"><span class="ph-t">${esc(game.title)}</span></div>
      <div class="row" style="margin-top:16px"><a class="btn" href="#/">← All games</a><a class="btn quiet" href="#/explore">Explore the roles</a></div></div>`;
  }

  // ---------- helpers on the data ----------
  const roleOf = (S, p) => S.data.roles[p.role] || { label: p.role, n_open: null };
  const skillName = (S, p, id) => ((S.names[p.set] || {})[id] || {}).name || id;
  const saved = S => Object.assign({ best: null, runs: [], seen: [], lastRead: null }, S.GS.record.game(SLUG));
  const roleHref = (S, p) => `#/role/${S.esc(p.set === "product" ? S.Atlas.productKey(p.role) : p.role)}`;
  const KIND = { benefits: "the benefits line", legal: "the legal line", about: "the company line" };

  // ---------- 01: the start: one sentence, Play on the profile's field, the field chips behind it ----------
  function howItWorks(S) {
    const { F, GS, esc } = S;
    S.phase = "start";
    const sv = saved(S), best = sv.best;
    const label = S.field === "all" ? "all fields" : (S.fields.find(([id]) => id === S.field) || [])[1] || S.field;
    const extra = `<div class="chips fields" role="group" aria-label="Postings from"><span class="lbl">Postings from</span>
        <button type="button" class="chip${S.field === "all" ? " on" : ""}" data-field="all" aria-pressed="${S.field === "all"}">All fields</button>
        ${S.fields.map(([id, l]) => `<button type="button" class="chip${S.field === id ? " on" : ""}" data-field="${esc(id)}" aria-pressed="${S.field === id}">${esc(l)}</button>`).join("")}
      </div>
      ${best ? `<p class="gm-best">Your best: <b>${Math.round(best.read * 100)}%</b> of the asks and filler read right</p>` : ""}`;
    GS.start(F, { title: "Spot the real ask", lead: "Every posting mixes what the job needs with filler. Read one line at a time, real ask or filler, and see at once how the atlas read it. Three postings a run.", playLabel: `Play · ${esc(label)}`, play: () => startRun(S), extra });
    F.body.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { S.field = b.dataset.field; howItWorks(S); });
  }

  // ---------- a run: easy, medium, hard; different roles and employers; the chosen field; not seen lately ----------
  function pickRun(S) {
    const pool = S.data.passages.filter(p => S.field === "all" || p.group === S.field);
    return deal(pool, new Set(saved(S).seen));
  }
  function startRun(S) {
    const passages = pickRun(S);
    if (!passages.length) return howItWorks(S);
    S.run = { passages, i: 0, results: [] };
    posting(S);
  }

  // ---------- the bullet with the line in question, and the whole posting coloured ----------
  // a bullet's pieces: the current line marked, lines already judged coloured by their state, the rest plain
  function bulletHtml(S, bullet, now, states) {
    return bullet.map(([text, k, label]) => {
      if (k == null || !label) return S.esc(text);
      if (k === now) return `<mark class="now">${S.esc(text)}</mark>`;
      const st = states.get(k);
      return st ? `<span class="ch ${st}">${S.esc(text)}</span>` : S.esc(text);
    }).join("");
  }
  function passageHtml(S, p, result) {
    const { esc } = S;
    let i = 0;
    const chunk = c => { const k = i++; const r = result.chunks[k]; const label = r.state === "found" ? `a real ask you found: ${skillName(S, p, r.skills[0])}` : r.state === "missed" ? `a real ask you called filler: ${skillName(S, p, r.skills[0])}` : r.state === "false" ? "filler you called an ask" : r.state === "skipped" ? "filler you let pass" : ""; return `<span class="ch ${r.state}"${label ? ` aria-label="${esc(c[0] + ", " + label)}"` : ""}>${esc(c[0])}</span>`; };
    const inline = chunks => chunks.map(c => c[1] ? chunk(c) : esc(c[0])).join("");
    const block = b => {
      if (b.kind === "gap") return `<div class="gap" role="separator" aria-label="text left out">…</div>`;
      if (b.kind === "list") {
        const items = [[]];
        for (const c of b.chunks) { if (c[1] === null && c[0] === "\n") items.push([]); else items[items.length - 1].push(c); }
        return `<ul>${items.map(it => `<li>${inline(it)}</li>`).join("")}</ul>`;
      }
      return `<p>${inline(b.chunks)}</p>`;
    };
    return `<div class="passage checked" role="group" aria-label="The posting excerpt, as the atlas read it"><div class="sec">${esc(p.section)}</div>${p.blocks.map(block).join("")}</div>`;
  }

  // ---------- 02: the posting, one line at a time ----------
  function posting(S) {
    const run = S.run, p = run.passages[run.i], role = roleOf(S, p);
    S.chunks = chunksOf(p); S.lines = linesOf(p); S.li = 0; S.answers = new Map(); S.states = new Map();
    S.F.set({ round: run.i, rounds: run.passages.length, marks: run.results.map(r => r.read >= 0.5 ? "ok" : "miss"), role: role.label });
    line(S);
  }
  function line(S) {
    const { F, GS, esc } = S, run = S.run, p = run.passages[run.i], L = S.lines[S.li], n = S.lines.length, asks = S.lines.filter(l => l.label === "a").length;
    S.phase = "line";
    const foundSoFar = [...S.states.values()].filter(s => s === "found").length;
    F.body.innerHTML = `<p class="eyebrow">Posting ${run.i + 1} of ${run.passages.length} · line ${S.li + 1} of ${n} · ${esc(p.section)}</p>
      <h1 class="sra-q">Real ask, or filler?</h1>
      <div class="sra-line" id="sra-line"><p>${bulletHtml(S, L.bullet, L.k, S.states)}</p></div>
      <div class="sra-choices" role="group" aria-label="Your call"><button type="button" class="gopt" data-say="ask"><kbd>1</kbd><span class="t">Real ask</span><span class="m">Something you can show: a skill, a tool, a degree, years</span></button><button type="button" class="gopt" data-say="filler"><kbd>2</kbd><span class="t">Filler</span><span class="m">Culture, benefits, legal lines, a temperament</span></button></div>
      <div class="sra-verdict" id="sra-verdict" aria-live="polite"></div>
      <p class="gm-key" id="sra-meter"><b class="count">${foundSoFar} of ${asks}</b> asks found so far. The employer is shown at the end of the posting.</p>
      <div class="sra-foot" id="sra-foot"></div>`;
    if (S.li === 0 && run.i === 0) window.scrollTo(0, 0);
    F.body.querySelectorAll("[data-say]").forEach(b => b.onclick = () => judge(S, b.dataset.say));
    if (S.li === 0 && run.i === 0) GS.coachOnce(SLUG, F.body.querySelector("#sra-line"), "The marked phrase is the line in question. Press 1 if the job really asks for it, 2 if it is filler. The atlas answers at once.", "beforebegin");
    F.live(`Line ${S.li + 1} of ${n}: ${L.text}`);
    const first = F.body.querySelector("[data-say]"); if (first) first.focus({ preventScroll: true });
  }
  // the verdict in place: what the line is, the skill and its share, or the filler and what the atlas makes of it
  function judge(S, say) {
    if (S.dead || S.phase !== "line") return;
    const { F, GS, esc } = S, run = S.run, p = run.passages[run.i], L = S.lines[S.li], role = roleOf(S, p);
    S.phase = "verdict";
    S.answers.set(L.k, say);
    const state = L.label === "a" ? (say === "ask" ? "found" : "missed") : (say === "ask" ? "false" : "skipped");
    S.states.set(L.k, state);
    const right = state === "found" || state === "skipped";
    let text;
    if (L.label === "a") {
      const name = skillName(S, p, L.skills[0]), gen = L.skills.every(s => S.generic.has(s));
      const share = L.share != null ? `<span class="num">${pct(L.share)}</span> of ${esc(role.label)} postings ask for it.` : "An ask the atlas counts.";
      text = `<b>${right ? "Real ask" : "A real ask, not filler"}: ${esc(name)}.</b> ${share}${gen ? " Asked for nearly everywhere: it counts, but it will not set you apart." : ""}`;
    } else {
      const what = KIND[L.kind] || `a stock phrase${L.phrase ? ` (“${esc(L.phrase)}”)` : ""}`;
      const counted = L.counted && L.countedShare != null ? ` The atlas counts it, as ${esc(skillName(S, p, L.counted))}: <span class="num">${pct(L.countedShare)}</span> of ${esc(role.label)} postings use a phrase like it; it tells you little.` : " Nothing you can show on a resume.";
      text = `<b>${right ? "Filler" : "Filler, not an ask"}: ${what}.</b>${counted}`;
    }
    const asks = S.lines.filter(l => l.label === "a").length, foundSoFar = [...S.states.values()].filter(s => s === "found").length;
    F.body.querySelector("#sra-verdict").innerHTML = `<div class="verdict ${right ? "ok" : "miss"}"><span class="mk">${right ? "✓" : "×"}</span><span>${text}</span></div>`;
    F.body.querySelector("#sra-line p").innerHTML = bulletHtml(S, L.bullet, null, S.states);
    F.body.querySelector("#sra-meter").innerHTML = `<b class="count">${foundSoFar} of ${asks}</b> asks found so far.`;
    F.body.querySelectorAll("[data-say]").forEach(b => { b.disabled = true; b.classList.toggle("on", b.dataset.say === say); });
    const last = S.li + 1 >= S.lines.length;
    F.body.querySelector("#sra-foot").innerHTML = GS.foot({ primary: { id: "sra-next", label: last ? "See the whole posting" : "Next line", key: "Enter" } });
    const nx = F.body.querySelector("#sra-next"); nx.onclick = () => nextLine(S); nx.focus({ preventScroll: true });
    F.live(`${right ? "Right. " : "Not quite. "}${F.body.querySelector("#sra-verdict").textContent} ${foundSoFar} of ${asks} asks found so far.`);
  }
  function nextLine(S) {
    if (S.dead || S.phase !== "verdict") return;
    S.li++;
    if (S.li < S.lines.length) line(S); else check(S);
  }

  // ---------- scoring (logic.scoreMarks) ----------
  function check(S) {
    const r = scoreMarks(S.chunks, marksOf(S.answers));
    S.run.results[S.run.i] = r;
    // the Know-your-role record: the posting read, its asks met, the ones found known
    const p = S.run.passages[S.run.i], rid = p.set === "product" ? S.Atlas.productKey(p.role) : p.role;
    S.GS.record.saveRole(rid, { label: roleOf(S, p).label, postings: [p.id], met: r.chunks.filter(c => c.label === "a").flatMap(c => c.skills), known: r.chunks.filter(c => c.state === "found").flatMap(c => c.skills) });
    reveal(S, r);
  }

  // the missed ask to tell one fact about: one with a share, outside the generic skills when possible, the most asked
  function missedFact(S, p, r) {
    const missed = r.chunks.filter(c => c.state === "missed");
    if (!missed.length) return null;
    const withShare = missed.filter(c => c.share != null);
    const pick = list => list.slice().sort((a, b) => b.share - a.share)[0];
    const c = pick(withShare.filter(c => c.skills.some(s => !S.generic.has(s)))) || pick(withShare) || missed[0];
    return { chunk: c, id: c.skills[0], name: skillName(S, p, c.skills[0]), share: c.share, more: missed.length - 1 };
  }
  // the resume line for a found ask (SRA1-C): how a posting of this set says it, from the evidence sentences, the
  // early-career ones first; the fit page quotes the same sentences
  async function sayLines(S, p, r) {
    const found = [...new Set(r.chunks.filter(c => c.state === "found").flatMap(c => c.skills.filter(s => !S.generic.has(s))))].slice(0, SAY);
    if (!found.length) return [];
    let ev = null;
    try {
      if (p.set === "product") { const P = S.productOf(); ev = id => ((P && P.skillById[id]) || {}).evidence || {}; }
      else { const E = await S.Atlas.fetchJson("data/" + S.ix.M.meta.evidence); ev = id => E[id] || {}; }
    } catch { return []; }
    return found.map(id => { const e = ev(id), q = ["early", "senior", "staff", "lead"].flatMap(k => e[k] || [])[0]; return q ? { id, name: skillName(S, p, id), q } : null; }).filter(Boolean);
  }

  // ---------- 03: the reveal: the whole posting coloured, the measure, one fact, the resume lines ----------
  function reveal(S, r) {
    const { F, GS, esc } = S, run = S.run, p = run.passages[run.i], role = roleOf(S, p), last = run.i === run.passages.length - 1;
    S.phase = "reveal";
    F.set({ marks: run.results.map(x => x.read >= 0.5 ? "ok" : "miss") });
    const m = missedFact(S, p, r);
    const top = r.chunks.filter(c => c.label === "a" && c.share != null).sort((a, b) => b.share - a.share)[0];
    const more = m && m.more ? `${m.more} more real ${m.more === 1 ? "ask" : "asks"} got past you` : "";
    const take = m ? (m.share != null ? `You called <b>${esc(m.name)}</b> filler: <span class="num">${pct(m.share)}</span> of ${esc(role.label)} postings ask for it${more ? `, and ${more}` : ""}.` : `You called <b>${esc(m.name)}</b> filler; it is an ask the atlas counts${more ? `, and ${more}` : ""}.`)
      : top ? `You found every ask. The one most postings want: <b>${esc(skillName(S, p, top.skills[0]))}</b>, <span class="num">${pct(top.share)}</span> of ${esc(role.label)} postings.` : "You found every ask in this posting.";
    const fillerWords = r.filler ? ` · ${r.skipped} of ${r.filler} filler ${r.filler === 1 ? "line" : "lines"} let pass` : "";
    F.body.innerHTML = GS.results({
      eyebrow: `Posting ${run.i + 1} of ${run.passages.length} · ${esc(p.company)} · ${esc(p.title)}`,   // named, not linked: no outbound posting links for now (POSTINGS in app.js)
      measure: `${r.found} of ${r.asks} asks found${fillerWords}`,
      takeaway: take,
      visual: `${passageHtml(S, p, r)}
        <div class="legend"><span><i class="sw found"></i>Real ask you found</span><span><i class="sw missed"></i>Real ask you called filler</span><span><i class="sw false"></i>Filler you called an ask</span><span><i class="sw skipped"></i>Filler you let pass</span></div>
        <div id="sra-say"></div>`,
      link: { href: roleHref(S, p), label: `Open ${role.label}` },
      foot: GS.foot({ primary: { id: "sra-next", label: last ? "See your result" : "Next posting", key: "Enter" } }),
    });
    window.scrollTo(0, 0);
    F.live(`${r.found} of ${r.asks} asks found${fillerWords}.`);
    F.body.querySelector("#sra-next").onclick = () => nextFromReveal(S);
    F.focusMeasure();
    sayLines(S, p, r).then(lines => {
      if (S.dead || S.phase !== "reveal" || S.run !== run || !lines.length) return;
      const box = F.body.querySelector("#sra-say"); if (!box) return;
      box.innerHTML = `<h3>Say it on your resume</h3><p class="small muted">For each ask you found, how a posting says it. Lead with one line of evidence that reads like this.</p>${lines.map(l => `<blockquote class="quote"><b>${esc(l.name)}</b>: “${esc(l.q.text.length > 200 ? l.q.text.slice(0, 197) + "…" : l.q.text)}”<span class="src">${esc(l.q.company)} · <a href="${esc(l.q.url)}" target="_blank" rel="noopener">${esc(l.q.title)}</a></span></blockquote>`).join("")}`;
    });
  }
  function nextFromReveal(S) {
    if (S.dead || S.phase !== "reveal") return;
    if (S.run.i === S.run.passages.length - 1) runEnd(S); else { S.run.i++; posting(S); }
  }

  // ---------- 04: the run end: the measure in plain words, the change since last time, the roles read ----------
  function runEnd(S) {
    const { F, GS, esc } = S, run = S.run, rs = run.results;
    S.phase = "end";
    const read = runRead(rs);
    const sum = k => rs.reduce((a, r) => a + r[k], 0);
    const found = sum("found"), asks = sum("asks"), passed = sum("skipped"), filler = sum("filler");
    const sv = saved(S), prev = sv.best, isBest = !prev || read > prev.read, prevLast = sv.lastRead;
    const today = new Date().toISOString().slice(0, 10);
    const roles = run.passages.map((p, i) => ({ p, r: rs[i], m: missedFact(S, p, rs[i]) }));
    GS.record.saveGame(SLUG, {
      played: true,
      best: isBest ? { read: Math.round(read * 1000) / 1000, date: today } : prev,
      lastRead: Math.round(read * 1000) / 1000,
      runs: [{ read: Math.round(read * 1000) / 1000, found, asks, passed, filler, date: today, rule: RULE, roles: run.passages.map(p => p.role) }, ...sv.runs].slice(0, KEEP.runs),
      seen: [...run.passages.map(p => p.id), ...sv.seen].slice(0, KEEP.seen),
    });
    const pr = v => `${Math.round(v * 100)}%`;
    const change = prevLast == null ? "Your first run." : read > prevLast + 0.0005 ? `Up from ${pr(prevLast)} last time.` : read < prevLast - 0.0005 ? `Down from ${pr(prevLast)} last time.` : "The same as last time.";
    const rec = `You read ${rs.length} ${rs.length === 1 ? "posting" : "postings"} and found <b>${found}</b> real asks the atlas now counts as known for ${run.passages.map(p => roleOf(S, p).label).join(", ")}. ${change}${isBest && prev ? " A new best." : prev ? ` Your best: <b>${pr(prev.read)}</b>.` : ""}`;
    F.body.innerHTML = GS.results({
      eyebrow: `${["One posting", "Two postings", "Three postings"][rs.length - 1] || rs.length + " postings"} read`,
      measure: `${found} of ${asks} asks found · ${passed} of ${filler} filler lines let pass`,
      record: rec,
      takeaway: `Your read: <b>${pr(read)}</b>, half for the asks you caught and half for the filler you let pass. The atlas reads <b>${fmt(S.nJobs)}</b> postings this way, so you don't have to.`,
      visual: `<h3>The roles you read</h3><div class="list">${roles.map(({ p, m }) => { const role = roleOf(S, p); const miss = m ? `you called ${m.name}${m.more ? ` and ${m.more} more` : ""} filler` : "you found every ask";
        return `<a class="r" href="${roleHref(S, p)}"><span class="t">${esc(role.label)}</span><span class="m">${esc(p.company)} · ${esc(p.title)} · ${esc(miss)}</span><span class="n">${role.n_open != null ? `<span class="n-blue">${fmt(role.n_open)}</span> open · ` : ""}Open →</span></a>`; }).join("")}</div>`,
      link: { href: "#/explore", label: "Explore the roles" },
      foot: GS.foot({ primary: { id: "sra-again", label: "Play again", key: "Enter" }, quiet: { id: "sra-field", label: "Change field" } }),
    });
    F.set({ round: rs.length, rounds: rs.length, marks: rs.map(x => x.read >= 0.5 ? "ok" : "miss"), role: "" });
    window.scrollTo(0, 0);
    F.body.querySelector("#sra-again").onclick = () => startRun(S);
    F.body.querySelector("#sra-field").onclick = () => howItWorks(S);
    F.focusMeasure();
  }

  return { logic, mount };
});
