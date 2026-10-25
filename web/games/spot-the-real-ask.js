/* Spot the real ask: a short excerpt from a real posting, cut into phrases. Mark the real asks, let the filler
   pass, then see how the atlas read the same lines. Three postings (easy, medium, hard) make a run and a rank.
   Data: web/data/game_passages.json (pipeline/game_passages.py), the taxonomies for skill names, the index for
   field labels and meta.n_jobs. Nothing a player does leaves the browser: the best read, the last five runs and the
   passages seen stay in the games record (web/gameshell.js). Drawn in the shared shell: one header, Enter checks,
   Esc quits. Spec: games/spot-the-real-ask/README.md.
   UMD like skill-path.js: `logic` (the deal, the scoring, the ranks; pure, no DOM) loads in node for
   evals/game_spot_scoring.mjs; the screens follow it. Registers window.Games["spot-the-real-ask"] = { mount }. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;   // node: require("web/games/spot-the-real-ask.js").logic
  else { root.Games = root.Games || {}; root.Games["spot-the-real-ask"] = { mount: mod.mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "spot-the-real-ask", TITLE = "Spot the real ask", SECONDS = 45;
  // a run's read (0 to 1, never shown) picks the rank; tuned by evals/game_spot_scoring.mjs, which reads them from here
  const RANKS = [["Skimmer", 0], ["Keyword spotter", 0.51], ["Careful reader", 0.64], ["Recruiter's eye", 0.8], ["Reads like the atlas", 0.98]];
  const RULE = 2;   // the scoring rule saved runs were ranked under: 2 = half asks found, half filler let pass; records from the first rule (F1) carry none
  const DIFFICULTIES = ["easy", "medium", "hard"];
  const KEEP = { runs: 5, seen: 30 };
  const fmt = n => Number(n).toLocaleString();
  const pct = v => Math.round(v * 100) + "%";
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const shuffle = (a, rand = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rankOf = read => { let r = RANKS[0][0]; for (const [name, min] of RANKS) if (read >= min) r = name; return r; };
  const rankIndex = name => Math.max(0, RANKS.findIndex(r => r[0] === name));
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

  // ---------- logic: pure, loads in node ----------
  // one passage's phrases in reading order, separators left out: what the player marks and what is scored
  function chunksOf(p) {
    const out = [];
    for (const b of p.blocks) if (b.kind !== "gap") for (const c of b.chunks) if (c[1]) out.push({ text: c[0], label: c[1], skills: c[1] === "a" ? c[2] : [], share: c[1] === "a" ? c[3] : null, kind: c[1] === "f" ? c[2] : null, phrase: c[1] === "f" ? c[3] : null, counted: c[1] === "f" ? c[4] : null, countedShare: c[1] === "f" ? c[5] : null });
    return out;
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
  // No ask found reads 0. "Other" chunks are neutral: shown as "not on the atlas's list", never counted.
  function readOf(found, asks, passed, filler) {
    if (!found || !asks) return 0;
    return 0.5 * found / asks + 0.5 * (filler ? passed / filler : 1);
  }
  // scoring: found, missed, false alarm, skipped filler, not on the list; marks is a Set of chunk indexes
  function scoreMarks(chunks, marks) {
    const out = chunks.map((c, i) => {
      const marked = marks.has(i);
      const state = c.label === "a" ? (marked ? "found" : "missed") : c.label === "f" ? (marked ? "false" : "skipped") : (marked ? "unlisted" : "plain");
      return { ...c, marked, state };
    });
    const n = s => out.filter(c => c.state === s).length;
    const found = n("found"), missed = n("missed"), falses = n("false"), skipped = n("skipped");
    const asks = found + missed, filler = falses + skipped;
    return { chunks: out, found, missed, falses, skipped, asks, filler, unlisted: n("unlisted"), read: readOf(found, asks, skipped, filler) };
  }
  // the run's read is the mean over its postings
  const runRead = results => results.length ? results.reduce((a, r) => a + r.read, 0) / results.length : 0;

  const logic = { RANKS, DIFFICULTIES, chunksOf, deal, readOf, scoreMarks, runRead, rankOf, rankIndex };

  async function mount(el, ctx) {
    const { Atlas, game, esc } = ctx, GS = window.GameShell;
    let data, ix, generic, names;
    try {
      const [D, TM, TP, IX, GEN] = await Promise.all([Atlas.fetchJson("data/game_passages.json"), Atlas.fetchJson("data/taxonomy_mba.json"), Atlas.fetchJson("data/taxonomy.json"), Atlas.index(), Atlas.genericSkills()]);
      if (!D || !Array.isArray(D.passages) || !D.passages.length) throw new Error("no passages");
      data = D; ix = IX; generic = GEN;
      names = { mba: Object.fromEntries(TM.skills.map(s => [s.id, s])), product: Object.fromEntries(TP.skills.map(s => [s.id, s])) };
    } catch (e) {
      console.error(e);
      return comingSoon(el, game, esc);   // the data file did not load: the page play() shows for a game not built yet
    }
    const INFO = GS.info({ rules: "A short excerpt from a real posting, cut into phrases. Mark the phrases that are real asks and let the filler pass, then see how the atlas read the same lines. Three postings make a run: easy, medium, hard.", keys: "Keys: click or drag across phrases to mark them (Tab and Space work too); Enter checks; Esc quits.", source: "The asks and their shares come from the atlas's reading of the role's postings." });
    const F = GS.frame(el, { game: TITLE, cls: "sra", info: INFO });
    const S = { el, F, GS, esc, showAside: ctx.showAside, data, names, generic, nJobs: (ix.M && ix.M.meta && ix.M.meta.n_jobs) || data.n_jobs, field: "all", run: null, timer: null, drag: null, Atlas };
    const have = new Set(data.passages.map(p => p.group));
    S.fields = ix.groups.filter(g => have.has(g.id)).map(g => [g.id, g.label]);
    // the default field: the profile's first field that has passages, else all fields
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    const mine = ((you && you.fields) || []).find(f => have.has(f)); if (mine) S.field = mine;
    S.offKeys = GS.keys({ confirm() { if (S.dead) return; if (S.phase === "start") startRun(S); else if (S.phase === "posting") check(S); else if (S.phase === "reveal") nextFromReveal(S); else if (S.phase === "end") startRun(S); } });
    window.addEventListener("hashchange", () => { stopTimer(S); S.dead = true; S.offKeys(); }, { once: true });
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
  const skillCluster = (S, p, id) => ((S.names[p.set] || {})[id] || {}).cluster || "";
  const saved = S => Object.assign({ best: null, runs: [], seen: [], lastRead: null, speed: false, clean: false }, S.GS.record.game(SLUG));

  // ---------- 01: the start: one sentence, Play on the profile's field, the field chips behind it ----------
  function howItWorks(S) {
    const { F, GS, esc } = S;
    S.phase = "start"; S.showAside(null);
    const sv = saved(S), best = sv.best;
    const label = S.field === "all" ? "all fields" : (S.fields.find(([id]) => id === S.field) || [])[1] || S.field;
    const extra = `<div class="chips fields" role="group" aria-label="Postings from"><span class="lbl">Postings from</span>
        <button type="button" class="chip${S.field === "all" ? " on" : ""}" data-field="all" aria-pressed="${S.field === "all"}">All fields</button>
        ${S.fields.map(([id, l]) => `<button type="button" class="chip${S.field === id ? " on" : ""}" data-field="${esc(id)}" aria-pressed="${S.field === id}">${esc(l)}</button>`).join("")}
      </div>
      ${sv.clean ? `<div class="chips" role="group" aria-label="Round"><button class="chip${sv.speed ? "" : " on"}" type="button" id="sra-untimed" aria-pressed="${!sv.speed}">Untimed</button><button class="chip${sv.speed ? " on" : ""}" type="button" id="sra-speed" aria-pressed="${sv.speed}">Speed round<span class="n">${SECONDS} s a posting</span></button></div>` : ""}
      ${best ? `<p class="gm-best">Your best: <b>${Math.round(best.read * 100)}%</b> of the asks and filler read right</p>` : ""}`;
    GS.start(F, { title: "Spot the real ask", lead: "Every posting mixes what the job needs with filler. Mark the real asks, let the filler pass, then see how the atlas read the same lines. Three postings a run.", playLabel: `Play · ${esc(label)}`, play: () => startRun(S), extra });
    F.body.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { S.field = b.dataset.field; howItWorks(S); });
    const sp = F.body.querySelector("#sra-speed"), un = F.body.querySelector("#sra-untimed");
    if (sp) { sp.onclick = () => { GS.record.saveGame(SLUG, { speed: true }); howItWorks(S); }; un.onclick = () => { GS.record.saveGame(SLUG, { speed: false }); howItWorks(S); }; }
  }

  // ---------- a run: easy, medium, hard; different roles and employers; the chosen field; not seen lately ----------
  function pickRun(S) {
    const pool = S.data.passages.filter(p => S.field === "all" || p.group === S.field);
    return deal(pool, new Set(saved(S).seen));
  }
  function startRun(S) {
    const passages = pickRun(S);
    if (!passages.length) return howItWorks(S);
    const sv = saved(S);
    S.run = { passages, i: 0, results: [], timed: !!(sv.clean && sv.speed) };
    posting(S);
  }

  // ---------- the passage, as markup ----------
  function passageHtml(S, p, result) {
    const { esc } = S;
    let i = 0;
    const chunk = c => {
      const k = i++;
      if (!result) return `<span class="ch" tabindex="0" role="checkbox" aria-checked="false" data-i="${k}">${esc(c[0])}</span>`;
      const r = result.chunks[k];
      const label = r.state === "found" ? `found: ${skillName(S, p, r.skills[0])}` : r.state === "missed" ? `missed: ${skillName(S, p, r.skills[0])}` : r.state === "false" ? "false alarm: filler" : r.state === "skipped" ? `filler you skipped: ${r.kind}` : r.state === "unlisted" ? "not on the atlas's list, does not count" : "";
      const tag = r.state === "found" ? `<span class="k good">${esc(skillName(S, p, r.skills[0]))}</span>` : r.state === "missed" ? `<span class="k warn">${esc(skillName(S, p, r.skills[0]))}</span>` : r.state === "false" ? `<span class="k warn">filler</span>` : r.state === "skipped" ? `<span class="k">${esc(r.kind)}</span>` : r.state === "unlisted" ? `<span class="k">not on the atlas's list</span>` : "";
      return `<span class="ch ${r.state}" tabindex="0" role="checkbox" aria-checked="${r.marked}" aria-disabled="true" data-i="${k}" aria-label="${esc(c[0] + (label ? ", " + label : ""))}">${esc(c[0])}</span>${tag}`;
    };
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
    return `<div class="passage${result ? " checked" : " marking"}" role="group" aria-label="Posting excerpt: mark the real asks" id="sra-passage">
      <div class="sec">${esc(p.section)}</div>${p.blocks.map(block).join("")}</div>`;
  }

  // ---------- 02: the posting ----------
  function posting(S) {
    const { F, GS, esc } = S, run = S.run, p = run.passages[run.i], role = roleOf(S, p);
    S.phase = "posting"; S.showAside(null);
    S.chunks = chunksOf(p); S.marks = new Set(); S.started = Date.now();
    F.set({ round: run.i, rounds: run.passages.length, marks: run.results.map(r => r.read >= 0.5 ? "ok" : "miss"), role: role.label });
    F.body.innerHTML = `<div class="head">
        <div><h1>Mark what this job actually asks for</h1><p class="small muted tight0">The employer is shown when you check.</p></div>
        ${run.timed ? `<div class="timer"><div class="t" id="sra-t">${clock(SECONDS)}</div><div class="bar" aria-hidden="true"><i id="sra-bar" style="width:100%"></i></div><div class="note" id="sra-note">A guide, not a cut-off</div></div>` : ""}
      </div>
      ${passageHtml(S, p, null)}
      <p class="gm-key"><span class="mono count" id="sra-count">0 marked</span> · Click a phrase, or drag across several.</p>
      ${GS.foot({ primary: { id: "sra-check", label: "Check my read", key: "Enter" }, quiet: { id: "sra-clear", label: "Clear marks" } })}`;
    window.scrollTo(0, 0);
    const passage = F.body.querySelector("#sra-passage"), count = F.body.querySelector("#sra-count");
    const chunkEls = [...passage.querySelectorAll(".ch")];
    const announce = () => { const n = S.marks.size; count.textContent = `${n} marked`; F.live(`${n} marked`); };
    const set = (i, on) => { i = Number(i); if (on) S.marks.add(i); else S.marks.delete(i); chunkEls[i].classList.toggle("on", on); chunkEls[i].setAttribute("aria-checked", on); };
    // mouse and touch: click toggles; a drag marks every phrase it crosses, or unmarks when it starts on a marked one
    passage.addEventListener("pointerdown", e => {
      const t = e.target.closest(".ch"); if (!t || e.button > 0) return;
      e.preventDefault();
      const i = Number(t.dataset.i);
      S.drag = { on: !S.marks.has(i), id: e.pointerId, seen: new Set([i]) };
      set(i, S.drag.on); announce(); t.focus({ preventScroll: true });
      try { passage.setPointerCapture(e.pointerId); } catch { }
    });
    passage.addEventListener("pointermove", e => {
      if (!S.drag || e.pointerId !== S.drag.id) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY), t = hit && hit.closest ? hit.closest("#sra-passage .ch") : null;
      if (!t) return;
      const i = Number(t.dataset.i);
      if (S.drag.seen.has(i)) return;
      S.drag.seen.add(i); set(i, S.drag.on); announce();
    });
    const endDrag = () => { S.drag = null; };
    passage.addEventListener("pointerup", endDrag); passage.addEventListener("pointercancel", endDrag);
    // keyboard: Tab and Shift+Tab move (native), Left and Right too; Space marks; Enter checks (the shell)
    passage.addEventListener("keydown", e => {
      const t = e.target.closest(".ch"); if (!t) return;
      const i = Number(t.dataset.i);
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); set(i, !S.marks.has(i)); announce(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const j = i + (e.key === "ArrowRight" ? 1 : -1); if (chunkEls[j]) chunkEls[j].focus(); }
    });
    F.body.querySelector("#sra-clear").onclick = () => { for (const i of [...S.marks]) set(i, false); announce(); };
    F.body.querySelector("#sra-check").onclick = () => check(S);
    if (chunkEls[0]) chunkEls[0].focus({ preventScroll: true });
    if (run.i === 0) GS.coachOnce(SLUG, passage, "Click the phrases that are real asks and let the filler pass, then check your read.");
    if (run.timed) startTimer(S, F.body.querySelector("#sra-t"), F.body.querySelector("#sra-bar"), F.body.querySelector("#sra-note"));
  }

  // the Speed round's soft clock: a guide that never ends a round and never changes the score
  function startTimer(S, t, bar, note) {
    stopTimer(S);
    const start = Date.now(), still = reduced();
    let over = false, shown = -1;
    const tick = () => {
      const left = Math.max(0, SECONDS - (Date.now() - start) / 1000), s = Math.ceil(left);
      if (s !== shown) { shown = s; t.textContent = clock(s); }
      // reduced motion: the bar steps every five seconds instead of sliding
      if (!still || s % 5 === 0) bar.style.width = (left / SECONDS * 100) + "%";
      if (left <= 0 && !over) { over = true; bar.parentElement.classList.add("over"); note.textContent = "Over time. Finish when you are ready."; S.F.live("Over time. Finish when you are ready."); stopTimer(S); }
    };
    tick();
    S.timer = setInterval(tick, 200);
  }
  function stopTimer(S) { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  // ---------- scoring (logic.scoreMarks), plus the time the read took ----------
  function score(S) {
    return { ...scoreMarks(S.chunks, S.marks), seconds: Math.round((Date.now() - S.started) / 1000) };
  }
  function check(S) {
    if (S.dead || !S.run || S.phase !== "posting") return;
    stopTimer(S);
    const r = score(S);
    S.run.results[S.run.i] = r;
    reveal(S, r);
  }

  // the missed ask to tell one fact about: one with a share, outside the generic skills when possible, the most asked
  function missedFact(S, p, r) {
    const missed = r.chunks.filter(c => c.state === "missed");
    if (!missed.length) return null;
    const withShare = missed.filter(c => c.share != null);
    const pick = list => list.slice().sort((a, b) => b.share - a.share)[0];
    const c = pick(withShare.filter(c => c.skills.some(s => !S.generic.has(s)))) || pick(withShare) || missed[0];
    const id = c.skills[0];
    return { chunk: c, id, name: skillName(S, p, id), share: c.share, generic: c.skills.every(s => S.generic.has(s)), cluster: skillCluster(S, p, id), more: missed.length - 1 };
  }
  const NUDGE = { credentials: "Say it plainly near the top of your resume.", tools: "Name the tools on your resume.", technical: "Name the tools on your resume." };
  function describeFiller(c) {
    if (c.kind === "benefits") return "the benefits line";
    if (c.kind === "legal") return "the legal line";
    if (c.kind === "about") return "the company line";
    return `“${c.text.length <= 48 ? c.text : c.phrase || c.text.slice(0, 40) + "…"}”`;
  }
  // the two halves of the read in plain words: the asks caught, the filler let pass
  const asksWords = (found, asks, short) => found ? `You caught ${found} of ${short ? "" : "the "}${asks} ${short ? "asks" : "things this posting asks for"}` : `You caught none of the ${asks} ${short ? "asks" : "things this posting asks for"}`;
  function fillerWords(passed, filler) {
    if (!filler) return "";
    const all = filler === 2 ? "both" : `all ${filler}`;
    if (passed === filler) return filler === 1 ? "You let the one filler line pass." : `You let ${all} filler lines pass.`;
    if (!passed) return filler === 1 ? "You marked the one filler line as an ask." : `You marked ${all} filler lines as asks.`;
    return `You let ${passed} of the ${filler} filler lines pass.`;
  }
  const list = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const roleHref = (S, p) => `#/role/${S.esc(p.set === "product" ? S.Atlas.productKey(p.role) : p.role)}`;

  // ---------- 03: the reveal ----------
  function reveal(S, r) {
    const { F, GS, esc } = S, run = S.run, p = run.passages[run.i], role = roleOf(S, p), last = run.i === run.passages.length - 1;
    S.phase = "reveal";
    F.set({ marks: run.results.map(x => x.read >= 0.5 ? "ok" : "miss") });
    // the source is named, not linked: the interface stays high level (owner's choice 2026-10-23; POSTINGS in app.js)
    F.body.innerHTML = `<h1 class="h-reveal">How the atlas read it</h1>
      ${passageHtml(S, p, r)}
      <blockquote class="quote src-line"><span class="src">${esc(p.company)} · ${esc(p.title)}</span></blockquote>
      <div class="legend"><span><i class="sw found"></i>You found it</span><span><i class="sw missed"></i>You missed it</span><span><i class="sw false"></i>False alarm</span><span><i class="sw skipped"></i>Filler you skipped</span><span><i class="sw unlisted"></i>Not on the atlas's list: does not count</span></div>`;
    window.scrollTo(0, 0);
    // the score in words
    const headline = r.found ? `${r.found} of ${r.asks} asks found` : "You did not mark any of the asks";
    let words = `${asksWords(r.found, r.asks)}. ${fillerWords(r.skipped, r.filler)}`;
    if (r.unlisted) words += ` ${r.unlisted === 1 ? "One of your marks is" : `${r.unlisted} of your marks are`} not on the atlas's list; ${r.unlisted === 1 ? "it does" : "they do"} not count.`;
    // one fact about one missed ask
    const m = missedFact(S, p, r);
    let missedHtml;
    if (!m) missedHtml = `<h3>Nothing missed</h3><p class="tight">You found every ask in this posting.</p>`;
    else {
      const nudge = m.generic ? "Asked for nearly everywhere: it counts, but it will not set you apart." : NUDGE[m.cluster] || "Show it with one line of evidence on your resume.";
      missedHtml = `<h3>${m.more ? "One you missed" : "The one you missed"}</h3><p class="small missed-name">${esc(m.name)}</p>` + (m.share != null
        ? `<div class="fact"><span class="num">${pct(m.share)}</span><span class="what">of ${esc(role.label)} postings ask for it. ${nudge}</span></div>`
        : `<p class="tight">An ask the atlas counts. ${nudge}</p>`);
    }
    // the filler: what passed, what was a false alarm, and the atlas's own count when it tags the phrase
    const skipped = r.chunks.filter(c => c.state === "skipped"), falses = r.chunks.filter(c => c.state === "false");
    let filler = "";
    if (skipped.length) filler += `You let ${list(skipped.map(describeFiller))} pass.`;
    if (falses.length) filler += (filler ? " " : "") + `${cap(list(falses.map(describeFiller)))} ${falses.length === 1 ? "is" : "are"} filler${skipped.length ? " too" : ""}.`;
    const counted = r.chunks.find(c => c.label === "f" && c.counted && c.countedShare != null);
    const countedHtml = counted ? `<div class="fact"><span class="num sm">${pct(counted.countedShare)}</span><span class="what">of ${esc(role.label)} postings use a phrase like “${esc(counted.phrase || counted.text)}”. The atlas counts them, as ${esc(skillName(S, p, counted.counted))}; they tell you little.</span></div>` : "";
    S.showAside(`<div class="sra-aside"><p class="eyebrow">Your read</p>
      <div class="score">${esc(headline)}</div>
      <p class="tight">${esc(words)}</p>
      ${missedHtml}
      <h3>Filler</h3><p class="tight">${esc(filler)}</p>${countedHtml}
      ${GS.foot({ primary: { id: "sra-next", label: last ? "See your result" : "Next posting", key: "Enter" }, quiet: { href: roleHref(S, p), label: `Open ${esc(role.label)}` } })}</div>`);
    F.live(`${r.found ? `${r.found} of ${r.asks} asks found` : `You did not mark any of the ${r.asks} asks`}; ${r.skipped} of ${r.filler} filler ${r.filler === 1 ? "line" : "lines"} let pass`);
    const next = document.getElementById("sra-next");
    next.onclick = () => nextFromReveal(S);
    next.focus({ preventScroll: true });
  }
  function nextFromReveal(S) {
    if (S.dead || S.phase !== "reveal") return;
    if (S.run.i === S.run.passages.length - 1) runEnd(S); else { S.run.i++; posting(S); }
  }

  // ---------- 04: the run end: the measure in plain words, the change since last time, the roles read ----------
  function runEnd(S) {
    const { F, GS, esc } = S, run = S.run, rs = run.results;
    S.phase = "end"; S.showAside(null);
    const read = runRead(rs);
    const sum = k => rs.reduce((a, r) => a + r[k], 0);
    const found = sum("found"), asks = sum("asks"), passed = sum("skipped"), filler = sum("filler");
    const sv = saved(S), prev = sv.best, isBest = !prev || read > prev.read, prevLast = sv.lastRead;
    const today = new Date().toISOString().slice(0, 10);
    const roles = run.passages.map((p, i) => ({ p, r: rs[i], m: missedFact(S, p, rs[i]) }));
    const cleanNow = !run.timed && found * 2 >= asks && !sv.clean;
    GS.record.saveGame(SLUG, {
      played: true,
      best: isBest ? { read: Math.round(read * 1000) / 1000, date: today } : prev,
      lastRead: Math.round(read * 1000) / 1000,
      runs: [{ read: Math.round(read * 1000) / 1000, found, asks, passed, filler, date: today, roles: run.passages.map(p => p.role) }, ...sv.runs].slice(0, KEEP.runs),
      seen: [...run.passages.map(p => p.id), ...sv.seen].slice(0, KEEP.seen),
      clean: sv.clean || cleanNow,
    });
    const pr = v => `${Math.round(v * 100)}%`;
    const change = prevLast == null ? "Your first run." : read > prevLast + 0.0005 ? `Up from ${pr(prevLast)} last time.` : read < prevLast - 0.0005 ? `Down from ${pr(prevLast)} last time.` : "The same as last time.";
    const rec = `${change}${isBest && prev ? " A new best." : prev ? ` Your best: <b>${pr(prev.read)}</b>.` : ""}${run.timed ? " A Speed round." : cleanNow ? " The Speed round is unlocked." : ""}`;
    F.body.innerHTML = GS.results({
      eyebrow: `${["One posting", "Two postings", "Three postings"][rs.length - 1] || rs.length + " postings"} read`,
      measure: `${found} of ${asks} asks found · ${passed} of ${filler} filler lines let pass`,
      record: rec,
      takeaway: `Your read: <b>${pr(read)}</b>, half for the asks you caught and half for the filler you let pass. You read ${["one posting", "two postings", "three postings"][rs.length - 1] || rs.length + " postings"}. The atlas reads <b>${fmt(S.nJobs)}</b> this way, so you don't have to.`,
      visual: `<h3>The roles you read</h3><div class="list">${roles.map(({ p, m }) => { const role = roleOf(S, p); const miss = m ? `you missed ${m.name}${m.more ? ` and ${m.more} more` : ""}` : "you found every ask";
        return `<a class="r" href="${roleHref(S, p)}"><span class="t">${esc(role.label)}</span><span class="m">${esc(p.company)} · ${esc(p.title)} · ${esc(miss)}</span><span class="n">${role.n_open != null ? `<span class="n-blue">${fmt(role.n_open)}</span> open · ` : ""}Open →</span></a>`; }).join("")}</div>`,
      link: { href: "#/explore", label: "Explore the roles" },
      foot: GS.foot({ primary: { id: "sra-again", label: "Play again", key: "Enter" } }),
    });
    F.set({ round: rs.length, rounds: rs.length, marks: rs.map(x => x.read >= 0.5 ? "ok" : "miss"), role: "" });
    window.scrollTo(0, 0);
    F.body.querySelector("#sra-again").onclick = () => startRun(S);
    F.focusMeasure();
  }

  return { logic, mount };
});
