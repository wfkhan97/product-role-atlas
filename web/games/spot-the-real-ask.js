/* Spot the real ask: a short excerpt from a real posting, cut into phrases. Mark the real asks, let the filler
   pass, then see how the atlas read the same lines. Three postings (easy, medium, hard) make a run and a rank.
   Data: web/data/game_passages.json (pipeline/game_passages.py), the taxonomies for skill names, the index for
   field labels and meta.n_jobs. Nothing a player does leaves the browser: the best rank, the last five runs and the
   passages seen stay in localStorage under game:spot-the-real-ask. Spec: games/spot-the-real-ask/README.md. */
(function () {
  "use strict";
  const SLUG = "spot-the-real-ask", KEY = "game:" + SLUG, SECONDS = 45;
  const RANKS = [["Skimmer", 0], ["Keyword spotter", 0.45], ["Careful reader", 0.6], ["Recruiter's eye", 0.8], ["Reads like the atlas", 0.93]];   // tuned, see the PR: the README's 0.75 and 0.9 put a careful first read on the top rank
  const DIFFICULTIES = ["easy", "medium", "hard"];
  const KEEP = { runs: 5, seen: 30 };
  const fmt = n => Number(n).toLocaleString();
  const pct = v => Math.round(v * 100) + "%";
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rankOf = read => { let r = RANKS[0][0]; for (const [name, min] of RANKS) if (read >= min) r = name; return r; };
  const rankIndex = name => Math.max(0, RANKS.findIndex(r => r[0] === name));
  // the player's record, in this browser only; with storage blocked the game plays the same and forgets
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { } },
  };
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

  async function mount(el, ctx) {
    const { Atlas, game, esc } = ctx;
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
    const S = { el, esc, showAside: ctx.showAside, data, names, generic, nJobs: (ix.M && ix.M.meta && ix.M.meta.n_jobs) || data.n_jobs, field: "all", run: null, timer: null, drag: null };
    const have = new Set(data.passages.map(p => p.group));
    S.fields = ix.groups.filter(g => have.has(g.id)).map(g => [g.id, g.label]);
    window.addEventListener("hashchange", () => { stopTimer(S); S.dead = true; }, { once: true });
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
  // one passage's phrases in reading order, separators left out: what the player marks and what is scored
  function chunksOf(p) {
    const out = [];
    for (const b of p.blocks) if (b.kind !== "gap") for (const c of b.chunks) if (c[1]) out.push({ text: c[0], label: c[1], skills: c[1] === "a" ? c[2] : [], share: c[1] === "a" ? c[3] : null, kind: c[1] === "f" ? c[2] : null, phrase: c[1] === "f" ? c[3] : null, counted: c[1] === "f" ? c[4] : null, countedShare: c[1] === "f" ? c[5] : null });
    return out;
  }
  function ranksHtml(current, dim) {
    const i = current == null ? -1 : rankIndex(current);
    return `<div class="ranks">${RANKS.map((_, k) => `<i class="${k < i ? "past" : k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="rankl">${RANKS.map((r, k) => `<span class="${k === i && !dim ? "on" : ""}">${r[0]}</span>`).join("")}</div>`;
  }

  // ---------- 01: how it works ----------
  function howItWorks(S) {
    const { el, esc } = S;
    S.showAside(null);
    const saved = store.get();
    const best = saved.best && saved.best.rank;
    const cf = S.names.mba.cross_functional ? S.names.mba.cross_functional.name : "Cross-functional leadership";
    el.innerHTML = `<div class="page sra">
      <p class="eyebrow">Game · three postings · about 3 minutes</p>
      <h1>Spot the real ask</h1>
      <p class="lead">Every posting mixes what the job needs with filler. Mark the real asks, let the filler pass, then see how the atlas read the same lines.</p>
      <div class="passage checked example" aria-label="Worked example">
        <p><span class="ch">Ability to manage multiple priorities</span> <span class="ch found">in a cross-functional</span><span class="k good">${esc(cf)}</span>, <span class="ch skipped">fast-paced environment</span><span class="k">filler</span></p>
      </div>
      <p class="small muted example-note">One line from a Keurig Dr Pepper brand management internship posting. “Cross-functional” is something you can show; “fast-paced” turns up in more than 1 in 5 postings.</p>
      <div class="rules">
        <div class="rule"><div class="t">Mark</div><div class="d">Click a phrase, or drag across several. <kbd>Tab</kbd> and <kbd>Space</kbd> work too.</div></div>
        <div class="rule"><div class="t">Skip</div><div class="d">Culture talk, benefits, legal lines and stock phrases like “self-starter” or “a passion for”.</div></div>
        <div class="rule"><div class="t">Check</div><div class="d">About 45 seconds a posting. The clock is a guide: it never cuts you off.</div></div>
      </div>
      <div class="chips fields" role="group" aria-label="Postings from"><span class="lbl">Postings from</span>
        <button type="button" class="chip${S.field === "all" ? " on" : ""}" data-field="all" aria-pressed="${S.field === "all"}">All fields</button>
        ${S.fields.map(([id, label]) => `<button type="button" class="chip${S.field === id ? " on" : ""}" data-field="${esc(id)}" aria-pressed="${S.field === id}">${esc(label)}</button>`).join("")}
      </div>
      <div class="row between start-row">
        <div class="best">
          <div class="small muted">${best ? `Five ranks. Your best in this browser: <b class="best-rank">${esc(best)}</b>` : "Five ranks. Your best in this browser appears here after a run."}</div>
          ${ranksHtml(best || null)}
        </div>
        <div class="row"><a class="btn quiet" href="#/">← All games</a><button type="button" class="btn primary" id="sra-start">Start reading →</button></div>
      </div>
    </div>`;
    window.scrollTo(0, 0);
    el.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { S.field = b.dataset.field; el.querySelectorAll("[data-field]").forEach(x => { const on = x.dataset.field === S.field; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); }); });
    el.querySelector("#sra-start").onclick = () => startRun(S);
  }

  // ---------- a run: easy, medium, hard; different roles and employers; the chosen field; not seen lately ----------
  function pickRun(S) {
    const seen = new Set(store.get().seen || []);
    const pool = S.data.passages.filter(p => S.field === "all" || p.group === S.field);
    const fresh = pool.filter(p => !seen.has(p.id));
    const used = { roles: new Set(), companies: new Set() }, run = [];
    const take = (cands, d) => shuffle(cands.filter(c => (!d || c.difficulty === d) && !used.roles.has(c.role) && !used.companies.has(c.company)))[0];
    for (const d of DIFFICULTIES) {
      const p = take(fresh, d) || take(pool, d) || take(fresh, null) || take(pool, null);
      if (!p) break;
      used.roles.add(p.role); used.companies.add(p.company); run.push(p);
    }
    return run;
  }
  function startRun(S) {
    const passages = pickRun(S);
    if (!passages.length) return howItWorks(S);
    S.run = { passages, i: 0, results: [] };
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
    const { el, esc } = S, run = S.run, p = run.passages[run.i], role = roleOf(S, p);
    S.showAside(null);
    S.chunks = chunksOf(p); S.marks = new Set(); S.started = Date.now();
    el.innerHTML = `<div class="page sra play">
      <div class="head">
        <div><p class="eyebrow">Posting ${run.i + 1} of ${run.passages.length} · ${esc(role.label)}</p><h1>Mark what this job actually asks for</h1><p class="small muted tight0">The employer is shown when you check.</p></div>
        <div class="timer"><div class="t" id="sra-t">${clock(SECONDS)}</div><div class="bar" aria-hidden="true"><i id="sra-bar" style="width:100%"></i></div><div class="note" id="sra-note">A guide, not a cut-off</div></div>
      </div>
      ${passageHtml(S, p, null)}
      <div class="bar-row">
        <div class="keys"><span class="mono count" id="sra-count">0 marked</span> &nbsp;·&nbsp; <kbd>Tab</kbd> next phrase &nbsp;<kbd>Shift</kbd><kbd>Tab</kbd> back &nbsp;<kbd>Space</kbd> mark &nbsp;<kbd>Enter</kbd> check</div>
        <div class="row"><button class="btn quiet" type="button" id="sra-clear">Clear marks</button><button class="btn primary" type="button" id="sra-check">Check my read</button></div>
      </div>
      <div class="sr-only" aria-live="polite" id="sra-live"></div>
    </div>`;
    window.scrollTo(0, 0);
    const passage = el.querySelector("#sra-passage"), live = el.querySelector("#sra-live"), count = el.querySelector("#sra-count");
    const chunkEls = [...passage.querySelectorAll(".ch")];
    const announce = () => { const n = S.marks.size; count.textContent = `${n} marked`; live.textContent = `${n} marked`; };
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
    // keyboard: Tab and Shift+Tab move (native), Left and Right too; Space marks; Enter checks; Escape drops the focus ring
    passage.addEventListener("keydown", e => {
      const t = e.target.closest(".ch"); if (!t) return;
      const i = Number(t.dataset.i);
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); set(i, !S.marks.has(i)); announce(); }
      else if (e.key === "Enter") { e.preventDefault(); check(S); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const j = i + (e.key === "ArrowRight" ? 1 : -1); if (chunkEls[j]) chunkEls[j].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); t.blur(); }
    });
    el.querySelector("#sra-clear").onclick = () => { for (const i of [...S.marks]) set(i, false); announce(); };
    el.querySelector("#sra-check").onclick = () => check(S);
    if (chunkEls[0]) chunkEls[0].focus({ preventScroll: true });
    startTimer(S, el.querySelector("#sra-t"), el.querySelector("#sra-bar"), el.querySelector("#sra-note"), live);
  }

  // the soft clock: a guide that never ends a round and never changes the score
  function startTimer(S, t, bar, note, live) {
    stopTimer(S);
    const start = Date.now(), still = reduced();
    let over = false, shown = -1;
    const tick = () => {
      const left = Math.max(0, SECONDS - (Date.now() - start) / 1000), s = Math.ceil(left);
      if (s !== shown) { shown = s; t.textContent = clock(s); }
      // reduced motion: the bar steps every five seconds instead of sliding
      if (!still || s % 5 === 0) bar.style.width = (left / SECONDS * 100) + "%";
      if (left <= 0 && !over) { over = true; bar.parentElement.classList.add("over"); note.textContent = "Over time. Finish when you are ready."; live.textContent = "Over time. Finish when you are ready."; stopTimer(S); }
    };
    tick();
    S.timer = setInterval(tick, 200);
  }
  function stopTimer(S) { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  // ---------- scoring: found, missed, false alarm, skipped filler, not on the list ----------
  function score(S) {
    const chunks = S.chunks.map((c, i) => {
      const marked = S.marks.has(i);
      const state = c.label === "a" ? (marked ? "found" : "missed") : c.label === "f" ? (marked ? "false" : "skipped") : (marked ? "unlisted" : "plain");
      return { ...c, marked, state };
    });
    const n = s => chunks.filter(c => c.state === s).length;
    const found = n("found"), missed = n("missed"), falses = n("false"), asks = found + missed, counted = found + falses;
    const P = counted ? found / counted : 0, R = asks ? found / asks : 0, F1 = P + R ? 2 * P * R / (P + R) : 0;
    return { chunks, found, missed, falses, asks, counted, unlisted: n("unlisted"), skipped: n("skipped"), P, R, read: F1, seconds: Math.round((Date.now() - S.started) / 1000) };
  }
  function check(S) {
    if (S.dead || !S.run) return;
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
  const list = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- 03: the reveal ----------
  function reveal(S, r) {
    const { el, esc } = S, run = S.run, p = run.passages[run.i], role = roleOf(S, p), last = run.i === run.passages.length - 1;
    el.innerHTML = `<div class="page sra tight">
      <p class="eyebrow">Posting ${run.i + 1} of ${run.passages.length} · ${esc(role.label)} · checked in ${clock(r.seconds)}</p>
      <h1 class="h-reveal">How the atlas read it</h1>
      ${passageHtml(S, p, r)}
      <blockquote class="quote src-line"><span class="src">${esc(p.company)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></span></blockquote>
      <div class="legend"><span><i class="sw found"></i>You found it</span><span><i class="sw missed"></i>You missed it</span><span><i class="sw false"></i>False alarm</span><span><i class="sw skipped"></i>Filler you skipped</span><span><i class="sw unlisted"></i>Not on the atlas's list: does not count</span></div>
      <div class="sr-only" aria-live="polite" id="sra-live"></div>
    </div>`;
    window.scrollTo(0, 0);
    // the score in words
    const headline = r.counted ? `${r.found} of ${r.asks} asks found` : "You did not mark any of the asks";
    let words = r.counted ? `You caught ${r.found} of the ${r.asks} things this posting asks for, and ${r.found} of your ${r.counted} counted marks were real asks.` : `You caught none of the ${r.asks} things this posting asks for.`;
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
    S.showAside(`<p class="eyebrow">Your read</p>
      <div class="score">${esc(headline)}</div>
      <p class="tight">${esc(words)}</p>
      ${missedHtml}
      <h3>Filler</h3><p class="tight">${esc(filler)}</p>${countedHtml}
      <h3>The atlas</h3><p class="punch">The atlas reads <span class="n-blue">${fmt(S.nJobs)}</span> postings this way, so you don't have to.</p>
      <div class="row next-row"><button type="button" class="btn primary" id="sra-next">${last ? "See your rank →" : "Next posting →"}</button><a class="btn" href="#/role/${esc(p.role)}">Open ${esc(role.label)} →</a></div>`);
    el.querySelector("#sra-live").textContent = r.counted ? `${r.found} of ${r.asks} asks found; ${r.found} of ${r.counted} counted marks were asks` : `You did not mark any of the ${r.asks} asks`;
    const next = document.getElementById("sra-next");
    next.onclick = () => { if (S.dead) return; if (last) runEnd(S); else { S.run.i++; posting(S); } };
    next.focus({ preventScroll: true });
  }

  // ---------- 04: the run end ----------
  function runEnd(S) {
    const { el, esc } = S, run = S.run, rs = run.results;
    S.showAside(null);
    const read = rs.reduce((a, r) => a + r.read, 0) / rs.length;
    const rank = rankOf(read);
    const found = rs.reduce((a, r) => a + r.found, 0), asks = rs.reduce((a, r) => a + r.asks, 0), counted = rs.reduce((a, r) => a + r.counted, 0);
    const saved = store.get(), prev = saved.best || null, isBest = !prev || read > prev.read;
    const today = new Date().toISOString().slice(0, 10);
    const roles = run.passages.map((p, i) => ({ p, r: rs[i], m: missedFact(S, p, rs[i]) }));
    store.set({
      best: isBest ? { rank, read: Math.round(read * 1000) / 1000, date: today } : prev,
      runs: [{ rank, read: Math.round(read * 1000) / 1000, found, asks, marks: counted, date: today, roles: run.passages.map(p => p.role) }, ...(saved.runs || [])].slice(0, KEEP.runs),
      seen: [...run.passages.map(p => p.id), ...(saved.seen || [])].slice(0, KEEP.seen),
    });
    el.innerHTML = `<div class="page sra tight">
      <p class="eyebrow">${["One posting", "Two postings", "Three postings"][rs.length - 1] || rs.length + " postings"} read</p>
      <div class="rank-title" tabindex="-1" id="sra-rank">${esc(rank)}</div>
      <p class="lead run-words">${counted ? `You caught ${found} of ${asks} asks, and ${found} of your ${counted} counted marks were real asks.` : `You caught none of the ${asks} asks.`}</p>
      ${isBest ? `<p class="small best-note">A new best in this browser.${prev ? ` Before: ${esc(prev.rank)}.` : ""}</p>` : prev ? `<p class="small muted">Your best in this browser: ${esc(prev.rank)}.</p>` : ""}
      <div class="rank-bar">${ranksHtml(rank)}</div>
      <p class="punch end-punch">You read ${["one posting", "two postings", "three postings"][rs.length - 1] || rs.length + " postings"}. The atlas reads <span class="n-blue">${fmt(S.nJobs)}</span> this way, so you don't have to.</p>
      <h2>The roles you read</h2>
      <div class="list">${roles.map(({ p, m }) => { const role = roleOf(S, p); const miss = m ? `you missed ${m.name}${m.more ? ` and ${m.more} more` : ""}` : "you found every ask";
        return `<a class="r" href="#/role/${esc(p.role)}"><span class="t">${esc(role.label)}</span><span class="m">${esc(p.company)} · ${esc(p.title)} · ${esc(miss)}</span><span class="n">${role.n_open != null ? `<span class="n-blue">${fmt(role.n_open)}</span> open · ` : ""}Open →</span></a>`; }).join("")}</div>
      <div class="row end-row"><button type="button" class="btn primary" id="sra-again">Play again</button><a class="btn" href="#/">All games</a><a class="btn quiet" href="#/explore">Explore the roles</a></div>
    </div>`;
    window.scrollTo(0, 0);
    el.querySelector("#sra-again").onclick = () => startRun(S);
    el.querySelector("#sra-rank").focus({ preventScroll: true });
  }

  window.Games = window.Games || {};
  window.Games[SLUG] = { mount };
})();
