/* Guide: the tips per screen (the usability pass of 2026-11-06, the guide plan). On a visitor's first visit to a screen,
   two to four spotlight steps on that screen's controls (the door: none, its own copy is the guide there); "Show me around" in the top bar and the footer
   replays the current screen's steps. Not a linear tour. A classic script like feedback.js, loaded after it and before
   app.js; node requires it for tests/web/guide.test.mjs with its dependencies passed in. Nothing draws while
   CONFIG.GUIDE_ENABLED is off: Guide.after returns false and app.js draws no relaunch link.
     Guide.STEPS / SCREENS             the step table (screen, id, targets tried in order, the state it needs) and each
                                       screen's version (raising one re-shows that screen once) and ready selector
     Guide.has(screen)                 pure: the screen has steps
     Guide.stepsFor(screen, ctx, present)  pure: the screen's steps for this state, each at its first present target
     Guide.due(input)                  pure: whether a run starts now, and why ("first" · "version" · "relaunch")
     Guide.readSeen / markSeen / writeSeen   pure: the seen-state, localStorage "guide.seen" ({ screen: version })
     Guide.seen() / mark(screen)       the seen-state in this browser
     Guide.mode(width)                 pure: "sheet" on a phone (640 px and under), else "spotlight"
     Guide.ctaId(screen)               pure: the call to action's id, guide_<screen>
     Guide.start / step(run, action)   pure: the run as a reducer: the next index, the end, the cta rows to send
     Guide.place(target, card, view)   pure: where the card goes beside the target (below, above, right, left)
     Guide.after(name, ctx)            app.js's one hook, after a screen draws: true when a run is due (the feedback
                                       prompt then waits); the run starts once the screen is still
     Guide.relaunch(name, ctx)         "Show me around": the screen's steps again, from the first
     Guide.isOpen()                    a run is open or about to start (the feedback prompt waits)
   A step shows only when its target is in the page (a box larger than zero, inside the page's width) and the state it
   needs holds; a missing target is skipped silently. The page is never inert and the card is a non-modal dialog: focus
   moves into it, Tab stays among its buttons, Esc closes it. What leaves the browser: Capture.cta rows only
   (guide_<screen> shown, click, done; guide_skip done; guide_relaunch click), each with the screen. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/guide.js")({ config, local, copy, capture })
  else root.Guide = factory({ config: () => root.CONFIG || {}, local: () => root.localStorage, copy: () => root.Copy, capture: () => root.Capture, win: root });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const enabled = () => !!cfg().GUIDE_ENABLED;
  const copy = () => { try { const c = typeof deps.copy === "function" ? deps.copy() : deps.copy; return (c && c.guide) || {}; } catch { return {}; } };
  const common = () => { try { const c = typeof deps.copy === "function" ? deps.copy() : deps.copy; return (c && c.common) || {}; } catch { return {}; } };
  const KEY = "guide.seen", PHONE_MAX = 640, GAP = 12, MARGIN = 16, QUIET_MS = 300, QUIET_CAP = 3000, REDRAW_MS = 150;
  const CTA_RE = /^[a-z][a-z0-9_]{1,31}$/;   // web/capture.js CTA_RE

  // ---------- the step table (step-table.md of the plan; the copy is Copy.guide.steps[screen][id]) ----------
  // target: selectors tried in order, the first present one wins. when: the state the step needs (ctx: campus, resume,
  // signedIn, config); a row without one needs only its target. ready: the screen counts as drawn once this is present.
  const SCREENS = {
    home: { version: 1 }, classes: { version: 1 }, jobs: { version: 2 }, skills: { version: 1 },
    role: { version: 1 }, fit: { version: 1, ready: ".fitcols" }, explore: { version: 1 }, field: { version: 1 },
    network: { version: 1, ready: "#nw-prep" }, you: { version: 1 }, about: { version: 1 },
  };
  const resume = c => !!(c && c.resume), noResume = c => !(c && c.resume);
  const STEPS = [
    { screen: "home", id: "verbs", target: ["#main .verbs"] },
    { screen: "home", id: "you", target: ["#main section.home-you:has(.opts)"] },   // the questions only, never the summary
    { screen: "home", id: "relaunch", target: ["#verbs [data-guide]", "#foot-guide"] },   // a phone: the top bar's link is past the edge
    { screen: "classes", id: "role", target: [".cls-roles"] },
    { screen: "classes", id: "band", target: [".cls-card .cls-rel"] },
    { screen: "classes", id: "resume", target: ["#cls-resume"], when: noResume },
    { screen: "classes", id: "gaps", target: [".cls-card .cls-gaps"], when: resume },
    { screen: "classes", id: "subjects", target: [".chips:has(> [data-subject])"] },
    { screen: "jobs", id: "search", target: ["#jsearch"] },
    { screen: "jobs", id: "quick", target: ["#jquick"] },
    { screen: "jobs", id: "fields", target: ["#jrail"] },
    { screen: "jobs", id: "card", target: ["#jlist .jcard"], when: noResume },
    { screen: "jobs", id: "cardFit", target: ["#jlist .jcard"], when: resume },
    { screen: "skills", id: "fields", target: [".lf-tiles", "#lf-body"] },
    { screen: "skills", id: "search", target: ["#lf-q"] },
    { screen: "skills", id: "resume", target: ["#lf-side"], when: noResume },
    { screen: "skills", id: "resumeFit", target: ["#lf-side"], when: resume },
    { screen: "role", id: "level", target: [".filters .seg"] },
    { screen: "role", id: "areas", target: ["details.areabox"] },
    { screen: "role", id: "rail", target: ["#rail-read", ".rail-tab"], when: noResume },
    { screen: "role", id: "railFit", target: ["#aside.rail .lead-rail", ".rail-tab"], when: resume },
    { screen: "fit", id: "level", target: ["#fit-level"] },
    { screen: "fit", id: "counts", target: [".fitcols"] },
    { screen: "fit", id: "links", target: [".fitcols .plinks-row"] },
    { screen: "fit", id: "posting", target: [".posting-box"] },
    { screen: "explore", id: "views", target: [".seg.views"] },
    { screen: "explore", id: "cards", target: [".fcards"] },
    { screen: "explore", id: "find", target: ["#sm-find"] },
    { screen: "field", id: "roles", target: [".field-split .list"] },
    { screen: "field", id: "chart", target: ["#chart"] },
    { screen: "field", id: "heart", target: [".field-split .list .heart"] },
    { screen: "network", id: "role", target: ["#nw-role"] },
    { screen: "network", id: "types", target: [".nw-tabs"] },
    { screen: "network", id: "prep", target: ["#nw-prep"] },
    { screen: "network", id: "copy", target: ["#nw-copy"] },
    { screen: "you", id: "opts", target: ["#main .opts"] },
    { screen: "you", id: "steps", target: ["#main .steps"] },
    { screen: "you", id: "answers", target: ["#main .list:has(a[href^=\"#/you?step=\"])"] },
    { screen: "you", id: "resume", target: ["#main a[href=\"#/you?step=3\"]"] },
    { screen: "about", id: "facts", target: [".about-facts"] },
    { screen: "about", id: "employers", target: ["details[data-k=\"about-top\"]"] },
    { screen: "about", id: "feedback", target: ["#verbs [data-feedback]", "#foot-feedback"], when: c => !!((c && c.config) || {}).FEEDBACK_ENABLED },
  ];
  const known = s => typeof s === "string" && Object.hasOwn(SCREENS, s);

  // ---------- the pure part ----------
  const has = screen => typeof screen === "string" && STEPS.some(r => r.screen === screen);
  function stepsFor(screen, ctx, present) {
    const c = ctx || {}, words = (copy().steps || {})[screen] || {}, out = [];
    for (const r of STEPS) {
      if (r.screen !== screen) continue;
      let ok = true; try { ok = !r.when || !!r.when(c); } catch { ok = false; }
      if (!ok) continue;
      let target = null;
      for (const sel of r.target) { let p = false; try { p = !!present(sel); } catch { p = false; } if (p) { target = sel; break; } }
      if (!target) continue;
      const w = words[r.id] || {};
      out.push({ id: r.id, target, title: w.title || "", body: w.body || "" });
    }
    return out;
  }
  // input: { screen, seen, version, enabled, busy, relaunch }
  function due(input) {
    const i = input || {}, no = { due: false, why: null };
    if (!i.enabled || !has(i.screen)) return no;
    if (i.relaunch) return { due: true, why: "relaunch" };
    if (i.busy) return no;
    const seen = i.seen && typeof i.seen === "object" ? i.seen : {};
    const version = Number.isInteger(i.version) ? i.version : (SCREENS[i.screen] || {}).version || 1;
    const was = seen[i.screen];
    if (!Number.isInteger(was) || was < 1) return { due: true, why: "first" };
    if (was < version) return { due: true, why: "version" };
    return no;
  }
  const clean = obj => {
    const out = {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    for (const [k, v] of Object.entries(obj)) {
      const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
      if (known(k) && Number.isInteger(n) && n >= 1) out[k] = n;
    }
    return out;
  };
  function readSeen(raw) { try { return raw == null || raw === "" ? {} : clean(JSON.parse(raw)); } catch { return {}; } }
  function markSeen(seen, screen, version) {
    const out = clean(seen);
    if (!known(screen)) return out;
    out[screen] = Number.isInteger(version) && version >= 1 ? version : SCREENS[screen].version;
    return out;
  }
  const writeSeen = obj => JSON.stringify(clean(obj));
  const mode = width => { const w = Number(width); return Number.isFinite(w) && w > 0 && w <= PHONE_MAX ? "sheet" : "spotlight"; };
  const ctaId = screen => { const id = "guide_" + screen; return has(screen) && CTA_RE.test(id) ? id : null; };

  // the run as a reducer: run = { screen, steps: [ids], i, clicked }; returns { run, end, cta, mark }
  function start(screen, steps) {
    const run = { screen, steps: (steps || []).slice(), i: 0, clicked: false };
    return { run, end: null, cta: [[ctaId(screen), "shown", { screen }]], mark: true };
  }
  function step(run, action) {
    const r = { ...run, steps: (run.steps || []).slice() }, a = action || {}, s = r.screen, id = ctaId(s);
    const out = (end, cta) => ({ run: r, end, cta: cta || [], mark: false });
    const present = typeof a.present === "function" ? a.present : () => true;
    const ahead = from => { for (let j = from; j < r.steps.length; j++) if (present(r.steps[j])) return j; return -1; };
    const click = () => { if (r.clicked) return []; r.clicked = true; return [[id, "click", { screen: s }]]; };
    switch (a.type) {
      case "next": {
        const j = ahead(r.i + 1);
        if (j < 0) return out("done", [[id, "done", { screen: s }]]);   // Next on the last tip is Done
        const c = click(); r.i = j; return out(null, c);
      }
      case "back": { for (let j = r.i - 1; j >= 0; j--) if (present(r.steps[j])) { r.i = j; break; } return out(null); }
      case "done": return out("done", [[id, "done", { screen: s }]]);
      case "skip": case "esc": case "close": case "outside": return out("skip", [["guide_skip", "done", { screen: s }]]);
      case "target": return out("engaged", click());
      case "left": return out("left");
      case "gone": return out("gone");
      case "redraw": {
        if (present(r.steps[r.i])) return out(null);
        const j = ahead(r.i + 1);
        if (j < 0) return out("gone");
        r.i = j; return out(null);
      }
      default: return out(null);
    }
  }
  // rectangles { left, top, width, height }; view { width, height }: the card below the target, else above, else
  // right, else left, never closer than 16 px to the window's edge
  function place(target, card, view) {
    const t = { left: +target.left || 0, top: +target.top || 0, width: +target.width || 0, height: +target.height || 0 };
    t.right = t.left + t.width; t.bottom = t.top + t.height;
    const cw = +card.width || 0, ch = +card.height || 0, vw = +view.width || 0, vh = +view.height || 0;
    const clampX = x => Math.max(MARGIN, Math.min(x, vw - MARGIN - cw)), clampY = y => Math.max(MARGIN, Math.min(y, vh - MARGIN - ch));
    if (t.bottom + GAP + ch <= vh - MARGIN) return { side: "below", left: clampX(t.left), top: Math.max(MARGIN, t.bottom + GAP) };
    if (t.top - GAP - ch >= MARGIN) return { side: "above", left: clampX(t.left), top: t.top - GAP - ch };
    if (t.right + GAP + cw <= vw - MARGIN) return { side: "right", left: Math.max(MARGIN, t.right + GAP), top: clampY(t.top) };
    return { side: "left", left: clampX(t.left - GAP - cw), top: clampY(t.top) };
  }

  // ---------- the seen-state in this browser ----------
  const store = () => { try { return (deps.local && deps.local()) || null; } catch { return null; } };
  function seen() { try { const s = store(); return readSeen(s ? s.getItem(KEY) : null); } catch { return {}; } }
  function mark(screen) { try { const s = store(); if (s && known(screen)) s.setItem(KEY, writeSeen(markSeen(seen(), screen, SCREENS[screen].version))); } catch { } }
  const send = rows => { try { const C = deps.capture && deps.capture(); if (C && C.cta) for (const [id, st, ctx] of rows) if (id) C.cta(id, st, ctx); } catch { } };

  const api = { KEY, PHONE_MAX, SCREENS, STEPS, has, stepsFor, due, readSeen, markSeen, writeSeen, seen, mark, mode, ctaId, start, step, place, enabled };
  const win = deps.win, doc = win && win.document;
  if (!doc) return Object.assign(api, { after: () => false, relaunch: () => false, isOpen: () => false });

  // ---------- the DOM part (tests/ui/guide.spec.mjs) ----------
  const $ = s => { try { return doc.querySelector(s); } catch { return null; } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fill = (s, v) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? String(v[k]) : m);
  // present: in the page, a box larger than zero, inside the page's width (a phone page wider than the screen hides it)
  function elOf(sel) {
    const el = $(sel); if (!el) return null;
    const r = el.getBoundingClientRect(), w = doc.documentElement.clientWidth || win.innerWidth;
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= w + 1 ? el : null;
  }
  const present = sel => !!elOf(sel);
  const reduced = () => { try { return win.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const phone = () => mode(win.innerWidth) === "sheet";

  let cur = null;       // the open run: { run, steps (with targets), el, ui, ... }
  let pending = null;   // a run waiting for the screen to be still: { token, obs, timers }
  let token = 0;

  function cancelPending() {
    if (!pending) return;
    try { pending.obs && pending.obs.disconnect(); } catch { }
    for (const t of pending.timers) clearTimeout(t);
    pending = null;
  }
  // wait until #main has had no mutation for 300 ms (at most 3 s), then for the screen's ready selector
  function whenStill(name, then) {
    cancelPending();
    const my = ++token, main = $("#main");
    const p = pending = { token: my, obs: null, timers: [] };
    const fire = () => {
      if (pending !== p) return;
      try { p.obs && p.obs.disconnect(); } catch { }
      p.timers.forEach(clearTimeout); p.timers = [];
      const ready = (SCREENS[name] || {}).ready;
      if (ready && !$(ready)) {
        p.obs = new win.MutationObserver(() => { if (pending === p && $(ready)) { p.obs.disconnect(); p.timers.push(setTimeout(() => { if (pending === p) { pending = null; then(); } }, QUIET_MS)); } });
        if (main) p.obs.observe(main, { childList: true, subtree: true }); else pending = null;
        p.waiting = true;
        return;
      }
      pending = null; then();
    };
    let quiet = setTimeout(fire, QUIET_MS);
    p.timers.push(setTimeout(fire, QUIET_CAP));
    if (main) {
      p.obs = new win.MutationObserver(() => { clearTimeout(quiet); p.timers = p.timers.filter(t => t !== quiet); quiet = setTimeout(fire, QUIET_MS); p.timers.push(quiet); });
      p.obs.observe(main, { childList: true, subtree: true, characterData: true });
    }
    p.timers.push(quiet);
  }
  const busyNow = () => !!($("#fb-box") || $("#drawer"));

  function after(name, ctx) {
    cancelPending();
    if (cur) end("left");
    const c = ctx || {};
    const d = due({ screen: name, seen: seen(), version: (SCREENS[name] || {}).version, enabled: enabled(), busy: !!c.busy });
    if (!d.due) return false;
    whenStill(name, () => {
      if (cur || busyNow() || screenOf() !== name) return;
      const steps = stepsFor(name, c, present);
      if (!steps.length) return;   // no step: no run, and the screen stays due
      open(name, steps, false);
    });
    return true;
  }
  const screenOf = () => { try { return win.Routes ? win.Routes.parseRoute(win.location.hash).name : null; } catch { return null; } };

  function relaunch(name, ctx) {
    cancelPending();
    if (cur) end("left");
    if (!enabled() || !has(name)) return false;
    const steps = stepsFor(name, ctx || {}, present);
    if (!steps.length) { none(); return false; }
    send([["guide_relaunch", "click", { screen: name }]]);
    open(name, steps, true);
    return true;
  }

  // ---------- one run on screen ----------
  function open(name, steps, relaunched) {
    const s = start(name, steps.map(x => x.id));
    cur = { run: s.run, steps, el: null, ui: null, prev: doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null, relaunched, listeners: [], obs: null, redrawT: null, raf: 0 };
    mark(name);
    build();
    show();
    send(s.cta);
  }
  const stepById = id => cur.steps.find(x => x.id === id);
  const selsOf = id => { const row = STEPS.find(r => r.screen === cur.run.screen && r.id === id); return row ? row.target : []; };
  const findEl = id => { for (const sel of selsOf(id)) { const el = elOf(sel); if (el) return el; } return null; };
  const presentId = id => !!findEl(id);

  function build() {
    const C = copy(), sheet = phone(), ui = {};
    if (sheet) doc.body.classList.add("guide-room");   // room below the page, so a target near its end can scroll above the sheet
    else {
      ui.hole = doc.createElement("div"); ui.hole.className = "guide-hole"; ui.hole.setAttribute("aria-hidden", "true");
      doc.body.appendChild(ui.hole);
    }
    ui.card = doc.createElement("div");
    ui.card.className = "guide-card" + (sheet ? " guide-sheet" : "");
    ui.card.setAttribute("role", "dialog"); ui.card.setAttribute("aria-modal", "false");
    ui.card.setAttribute("aria-labelledby", "guide-t"); ui.card.setAttribute("aria-describedby", "guide-b");
    ui.card.tabIndex = -1;
    ui.card.innerHTML = `<div class="guide-h"><p class="eyebrow" id="guide-n"></p><button type="button" class="close" data-g="close" aria-label="${esc(C.close)}">×</button></div>
      <h2 id="guide-t"></h2><p class="guide-b" id="guide-b"></p>
      <div class="guide-f"><button type="button" class="linkish" data-g="skip">${esc(C.skip)}</button><span class="guide-nav"><button type="button" class="btn" data-g="back">${esc(C.back)}</button><button type="button" class="btn primary" data-g="next">${esc(C.next)}</button></span></div>`;
    doc.body.appendChild(ui.card);
    ui.card.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-g]"); if (!b) return; act(b.dataset.g); });
    cur.ui = ui;
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cur.listeners.push([t, ev, fn, opt]); };
    on(doc, "keydown", onKey, true);
    on(doc, "click", onClick, true);
    on(win, "scroll", follow, { passive: true });
    on(win, "resize", follow);
    const obs = new win.MutationObserver(() => { clearTimeout(cur.redrawT); cur.redrawT = setTimeout(redraw, REDRAW_MS); });
    for (const sel of ["#main", "#aside"]) { const el = $(sel); if (el) obs.observe(el, { childList: true, subtree: true }); }
    cur.obs = obs;
  }
  // the count: the tip's place among the steps whose targets are in the page now
  function show(quiet) {
    const C = copy(), id = cur.run.steps[cur.run.i], st = stepById(id), el = findEl(id);
    if (!el) { const r = step(cur.run, { type: "redraw", present: presentId }); cur.run = r.run; if (r.end) return end(r.end); return show(quiet); }
    if (cur.el && cur.el !== el) cur.el.classList.remove("guide-ring");
    cur.el = el;
    const live = cur.run.steps.filter(presentId), n = live.length, i = live.indexOf(id) + 1;
    const ui = cur.ui;
    ui.card.querySelector("#guide-n").textContent = fill(C.count, { i, n });
    ui.card.querySelector("#guide-t").textContent = st.title;
    ui.card.querySelector("#guide-b").textContent = st.body;
    ui.card.querySelector('[data-g="back"]').hidden = i <= 1;
    ui.card.querySelector('[data-g="next"]').textContent = i >= n ? C.done : C.next;
    if (phone()) {
      el.classList.add("guide-ring");
      if (quiet) return;
      const top = el.getBoundingClientRect().top + win.scrollY - MARGIN;
      win.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "instant" });
    } else {
      if (!quiet) try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced() ? "auto" : "smooth" }); } catch { el.scrollIntoView(); }
      position();
    }
    if (!quiet) ui.card.focus({ preventScroll: true });
  }
  function position() {
    if (!cur || !cur.el || !cur.ui.hole) return;
    const r = cur.el.getBoundingClientRect(), pad = 4, ui = cur.ui;
    Object.assign(ui.hole.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + 2 * pad + "px", height: r.height + 2 * pad + "px" });
    const vw = doc.documentElement.clientWidth || win.innerWidth, vh = win.innerHeight;
    const vis = { left: r.left, top: Math.max(r.top, 0), width: r.width, height: Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) };
    const cr = ui.card.getBoundingClientRect(), p = place(vis, { width: cr.width, height: cr.height }, { width: vw, height: vh });
    ui.card.style.left = p.left + "px"; ui.card.style.top = p.top + "px"; ui.card.dataset.side = p.side;
  }
  function follow() { if (!cur || cur.raf) return; cur.raf = win.requestAnimationFrame(() => { if (cur) { cur.raf = 0; position(); } }); }
  function redraw() {
    if (!cur) return;
    const id = cur.run.steps[cur.run.i];
    if (cur.el && cur.el.isConnected && findEl(id) === cur.el) return position();
    const r = step(cur.run, { type: "redraw", present: presentId });
    cur.run = r.run;
    if (r.end) return end(r.end);
    show(true);   // the same tip on the new node, or the next present one: no scroll, focus stays where it is
  }
  function act(type) {
    if (!cur) return;
    const r = step(cur.run, { type, present: presentId });
    cur.run = r.run;
    const rows = r.cta;
    if (r.end) { const screen = cur.run.screen; end(r.end); send(rows); return screen; }
    send(rows);
    show();
  }
  function onKey(e) {
    if (!cur) return;
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); act("esc"); return; }
    if (e.key !== "Tab") return;
    const card = cur.ui.card;
    if (!card.contains(doc.activeElement)) return;   // a screen reader in browse mode may leave the card; the page is never inert
    const els = [...card.querySelectorAll("button")].filter(b => !b.hidden && !b.disabled);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1], at = doc.activeElement;
    e.preventDefault();
    if (at === card) (e.shiftKey ? last : first).focus();
    else { const k = els.indexOf(at), j = e.shiftKey ? (k <= 0 ? els.length - 1 : k - 1) : (k >= els.length - 1 ? 0 : k + 1); els[j].focus(); }
  }
  function onClick(e) {
    if (!cur) return;
    const t = e.target;
    if (cur.ui.card.contains(t)) return;
    if (cur.el && cur.el.contains(t)) { act("target"); return; }   // the click goes through to the page
    act("outside");
  }
  // every end removes the overlay; done, skip and gone give focus back (to where it was, else the screen's h1)
  function end(how) {
    if (!cur) return;
    const c = cur; cur = null;
    for (const [t, ev, fn, opt] of c.listeners) t.removeEventListener(ev, fn, opt);
    try { c.obs && c.obs.disconnect(); } catch { }
    clearTimeout(c.redrawT); if (c.raf) win.cancelAnimationFrame(c.raf);
    if (c.el) c.el.classList.remove("guide-ring");
    doc.body.classList.remove("guide-room");
    if (c.ui) { if (c.ui.hole) c.ui.hole.remove(); c.ui.card.remove(); }
    if (how === "left" || how === "engaged") return;
    let back = c.prev && c.prev.isConnected ? c.prev : null;
    if (!back) { back = $("#main h1"); if (back && !back.hasAttribute("tabindex")) back.setAttribute("tabindex", "-1"); }
    if (back) try { back.focus({ preventScroll: true }); } catch { }
  }
  // "This screen has no tips right now." with Close; nothing is sent
  function none() {
    const C = copy(), prev = doc.activeElement;
    const card = doc.createElement("div");
    card.className = "guide-card guide-none" + (phone() ? " guide-sheet" : "");
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-label", C.dialog || ""); card.tabIndex = -1;
    card.innerHTML = `<p class="guide-b">${esc(C.none)}</p><div class="guide-f"><span></span><button type="button" class="btn" data-g="close">${esc(common().close || "Close")}</button></div>`;
    const close = () => { doc.removeEventListener("keydown", key, true); card.remove(); if (prev && prev.isConnected) try { prev.focus(); } catch { } };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    card.querySelector("[data-g]").onclick = close;
    doc.addEventListener("keydown", key, true);
    doc.body.appendChild(card);
    card.focus();
  }
  // a route change ends the run at once (no event; the screen was marked at its first tip)
  win.addEventListener("hashchange", () => { cancelPending(); if (cur) end("left"); });
  const isOpen = () => !!cur || !!(pending && !pending.waiting);
  return Object.assign(api, { after, relaunch, isOpen, present });
});
