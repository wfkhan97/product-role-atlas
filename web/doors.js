/* Doors: the door (#/) and the intake boxes as Tally forms, with the native form as the fallback (PLAN.md, "The four
   verbs (v19)", step B7). A classic script like web/catalog.js, loaded after capture.js and before app.js; node
   requires it for tests/web/doors.test.mjs with its dependencies passed in. CONFIG.TALLY holds one light and one dark
   form per kind (2026-11-01: a Tally theme is per form, and a light form's dark text was illegible on the site's dark
   mode); mount takes the theme in effect and app.js remounts on a theme change. Until an id is set, mount draws the native form at once: the site never shows a blank box. With an id,
   mount adds Tally's embed script once (at mount time, never in index.html) and draws the iframe. The hidden fields
   ride as query parameters: surface, source, role, email. That is what the native form would send; nothing typed or
   uploaded. When three seconds pass with no Tally message and no height change, the native form takes the iframe's
   place; the iframe's own load event says nothing, since an unknown form id loads Tally's error page just as well
   (seen with a made-up id: load fired, no message, no resize, a blank box). A Tally answer never passes through this script: the form posts to Tally. The native
   fallback posts through Capture.waitlist with the source `door` or `intake_<surface>`. The door's Tally form comes
   back to #/home?email=…&where=… (the redirect the owner sets in Tally, with @email and @where). The screen reads it
   once (returnQuery), stores it and replaces the URL (clearQuery). No A/B field anywhere: that test was dropped. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/doors.js")({ config, capture, window, document, now, timer, clear })
  else root.Doors = factory({ config: () => root.CONFIG || {}, capture: () => root.Capture, window: () => root, document: () => root.document, now: () => Date.now(), timer: (fn, ms) => root.setTimeout(fn, ms), clear: id => root.clearTimeout(id) });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EMBED = "https://tally.so/embed/", SCRIPT = "https://tally.so/widgets/embed.js", ORIGIN = "https://tally.so";
  const FALLBACK_MS = 3000;
  // the verbs with an intake box; a kind is `door` or `intake_<surface>`. "positioning" (2026-11-01) is not a verb but
  // the role rail's "Help me improve my positioning", a box of its own (pipeline/sql/2026-11-01_positioning.sql)
  const SURFACES = ["skills", "classes", "network", "positioning"];
  const KINDS = ["door", ...SURFACES.map(s => "intake_" + s)];
  // the hidden fields every form carries, in this order; nothing else
  const HIDDEN = ["surface", "source", "role", "email"];
  // the names capture.js and pipeline/sql/2026-10-31_doors.sql gain with this step (intake_positioning: 2026-11-01_positioning.sql)
  const NAMES = {
    events: ["door", "door_passed", "home_jobs", "home_skills", "home_classes", "home_network", ...SURFACES.map(s => "intake_" + s)],
    sources: ["door", ...SURFACES.map(s => "intake_" + s)],
  };
  const isKind = k => KINDS.includes(k);
  const surfaceOf = kind => kind === "door" ? "door" : isKind(kind) ? kind.slice("intake_".length) : null;
  const sourceOf = kind => isKind(kind) ? kind : null;
  const kindOf = surface => surface === "door" ? "door" : SURFACES.includes(surface) ? "intake_" + surface : null;
  // the event the screen fires when Tally reports a submission (the native path fires it through Capture.waitlist)
  const submittedEvent = kind => kind === "door" ? "door_passed" : isKind(kind) ? kind : null;
  // the theme in effect: the page's override (<html data-theme>, set by app.js applyTheme), else the device's
  // prefers-color-scheme; "light" when neither can be read (node)
  function themeOf() {
    try {
      const doc = deps.document && deps.document(), w = deps.window && deps.window();
      const t = doc && doc.documentElement && doc.documentElement.dataset && doc.documentElement.dataset.theme;
      if (t === "dark" || t === "light") return t;
      return w && typeof w.matchMedia === "function" && w.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch { return "light"; }
  }
  // The form id from CONFIG.TALLY for a kind and a theme ("light" | "dark"; the theme in effect when omitted); null
  // until the owner sets it. The shape: { door: { light, dark }, intake_<surface>: { light, dark }, … }. An intake
  // kind with no entry takes intake_skills' pair, then the flat `intake` of the first cut ({ door: "id", intake: "id" }),
  // whose one id serves both themes. A pair without the theme's id gives null: the native form, which follows the
  // theme, is better than an illegible one.
  function formIdFor(kind, config, theme) {
    if (!isKind(kind)) return null;
    const t = (config || cfg()).TALLY || {}, th = (theme || themeOf()) === "dark" ? "dark" : "light";
    const entry = (kind === "door" ? [t.door] : [t[kind], t.intake_skills, t.intake]).find(v => v != null);
    const id = typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry[th] : null;
    return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id) ? id : null;
  }
  // the embed URL: Tally's four display options, then the hidden fields (empty when unknown, so the field exists)
  function embedSrc(kind, formId, hidden) {
    const q = new URLSearchParams({ alignLeft: "1", hideTitle: "1", transparentBackground: "1", dynamicHeight: "1" });
    const h = hidden || {};
    const values = { surface: surfaceOf(kind), source: sourceOf(kind), role: h.role, email: h.email };
    for (const k of HIDDEN) q.set(k, values[k] == null ? "" : String(values[k]).trim().slice(0, 320));
    return `${EMBED}${formId}?${q}`;
  }
  // the iframe markup for one form; "" when the kind is unknown or no id is set (the caller draws the native form).
  // opts: formId (else CONFIG.TALLY for opts.theme), theme, hidden
  function embedHtml(kind, opts) {
    opts = opts || {};
    const formId = opts.formId || formIdFor(kind, null, opts.theme);
    if (!isKind(kind) || !formId) return "";
    const title = kind === "door" ? "Welcome to GradBuddy" : "Notify me";
    return `<iframe data-tally-src="${esc(embedSrc(kind, formId, opts.hidden))}" loading="lazy" width="100%" height="${kind === "door" ? 360 : 200}" frameborder="0" marginheight="0" marginwidth="0" title="${esc(title)}" data-doors="${esc(kind)}"${opts.theme ? ` data-doors-theme="${esc(opts.theme)}"` : ""}></iframe>`;
  }

  // ---------- the fallback clock, pure ----------
  // state: at (when the clock started; null until the iframe is in view), loaded, height (the iframe's height then)
  const freshState = (at, height) => ({ at, loaded: false, height: height == null ? "" : String(height) });
  // loaded once the height changed (Tally's dynamicHeight resizes the iframe) or a load signal arrived
  const loadedCheck = (state, height) => state.loaded || (state.at != null && String(height ?? "") !== state.height) ? { ...state, loaded: true } : state;
  const markLoaded = state => state.loaded ? state : { ...state, loaded: true };
  // true when the clock has run three seconds and nothing says the form loaded
  const shouldFallback = (state, now) => !state.loaded && state.at != null && now - state.at >= FALLBACK_MS;
  // a message from the Tally iframe: {"event":"Tally.FormLoaded","payload":{"formId":"…"}} as a JSON string;
  // null for anything else
  function readMessage(data) {
    try {
      const m = typeof data === "string" ? JSON.parse(data) : data;
      if (m && typeof m.event === "string" && m.event.startsWith("Tally.")) return { event: m.event.slice("Tally.".length), formId: (m.payload && m.payload.formId) || null, payload: m.payload || {} };
    } catch { }
    return null;
  }

  // ---------- the Tally return, pure ----------
  const RETURN_KEYS = ["email", "where"];
  const splitHash = hash => { const h = String(hash || ""), i = h.indexOf("?"); return i < 0 ? [h, ""] : [h.slice(0, i), h.slice(i + 1)]; };
  // { email, where } from #/home?email=…&where=…; "" for a missing key
  function returnQuery(hash) {
    const p = new URLSearchParams(splitHash(hash)[1]), out = {};
    for (const k of RETURN_KEYS) out[k] = (p.get(k) || "").trim().slice(0, 320);
    return out;
  }
  // the hash without email and where; other keys stay, and the "?" goes when nothing is left
  function clearQuery(hash) {
    const [path, search] = splitHash(hash), p = new URLSearchParams(search);
    for (const k of RETURN_KEYS) p.delete(k);
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  }

  // ---------- the native fallback's submit ----------
  // fields: { email, role, where, ctx }; the row goes out with the source `door` or `intake_<surface>` and the surface
  function nativeSubmit(kind, fields) {
    const C = deps.capture && deps.capture(), source = sourceOf(kind);
    if (!C || !source) return Promise.resolve(false);
    fields = fields || {};
    const ctx = { ...(fields.ctx || {}), surface: surfaceOf(kind) };
    if (fields.role) ctx.role_id = fields.role;
    if (fields.where) ctx.program = fields.where;
    return Promise.resolve().then(() => C.waitlist(fields.email, source, ctx)).catch(() => false);
  }

  // ---------- the browser side ----------
  // Tally's embed script, added once at mount time; when it fails the iframes take their src directly, as Tally's own
  // snippet does, and the clock decides
  function loadScript(w, doc) {
    if (w.Tally) return;
    if (doc.querySelector(`script[src="${SCRIPT}"]`)) return;
    const s = doc.createElement("script");
    s.src = SCRIPT; s.async = true;
    s.onload = () => { if (w.Tally && w.Tally.loadEmbeds) w.Tally.loadEmbeds(); };
    s.onerror = () => doc.querySelectorAll("iframe[data-tally-src]:not([src])").forEach(f => { f.src = f.dataset.tallySrc; });
    (doc.body || doc.head).appendChild(s);
  }
  // Draws the form into el. opts: formId (else CONFIG.TALLY for the theme), theme ("light" | "dark"; the theme in
  // effect when omitted), hidden { role, email }, native() -> the native form's
  // markup, onFallback(reason) once the native form is in place ("unset": no id; "timeout": three seconds without a
  // load; "error"), onSubmitted(payload) when Tally reports a submission, onLoaded() once, on the first sign of a real
  // form (a Tally message for this form, or the iframe resized: dynamicHeight). The clock starts when the iframe comes
  // into view (loading="lazy" loads nothing before that). Returns { native, kind, theme, formId, destroy() }: app.js
  // compares formId with the other theme's on a theme change and mounts again when they differ.
  function mount(el, kind, opts) {
    opts = opts || {};
    const w = deps.window ? deps.window() : null, doc = deps.document ? deps.document() : null;
    const setT = deps.timer || ((fn, ms) => setTimeout(fn, ms)), clearT = deps.clear || (id => clearTimeout(id));
    let timer = null, onMessage = null, io = null, ro = null;
    const theme = (opts.theme || themeOf()) === "dark" ? "dark" : "light";
    const formId = opts.formId || formIdFor(kind, null, theme);
    const handle = {
      native: false, kind, theme, formId,
      destroy() {
        if (timer != null) clearT(timer); timer = null;
        if (w && onMessage) w.removeEventListener("message", onMessage); onMessage = null;
        if (io) io.disconnect(); io = null;
        if (ro) ro.disconnect(); ro = null;
      },
    };
    const native = reason => {
      if (handle.native) return;
      handle.native = true; handle.destroy();
      try { el.innerHTML = opts.native ? opts.native() : ""; } catch { }
      if (opts.onFallback) { try { opts.onFallback(reason); } catch { } }
    };
    if (!el || !isKind(kind) || !formId) { native("unset"); return handle; }
    if (!w || !doc) { native("error"); return handle; }
    try {
      el.innerHTML = embedHtml(kind, { formId, theme, hidden: opts.hidden });
      const iframe = el.querySelector("iframe[data-tally-src]");
      if (!iframe) throw new Error("no iframe");
      loadScript(w, doc);
      if (w.Tally && w.Tally.loadEmbeds) w.Tally.loadEmbeds();
      let state = freshState(null, "");
      const heightOf = () => (iframe.style && iframe.style.height) || iframe.getAttribute("height") || "";
      const h0 = heightOf();
      // a real form: any Tally message for it, or the iframe resized (never the iframe's load event: an error page
      // loads too)
      const loaded = () => { if (state.loaded) return; state = markLoaded(state); if (opts.onLoaded) { try { opts.onLoaded(); } catch { } } };
      const start = () => {
        if (state.at != null) return;
        state = { ...freshState(deps.now(), heightOf()), loaded: state.loaded };
        timer = setT(() => { timer = null; state = loadedCheck(state, heightOf()); if (shouldFallback(state, deps.now())) native("timeout"); else if (state.loaded) loaded(); }, FALLBACK_MS);
      };
      onMessage = e => {
        if (e.origin !== ORIGIN) return;
        const m = readMessage(e.data);
        if (!m || (m.formId && m.formId !== formId)) return;
        loaded();
        if (m.event === "FormSubmitted" && opts.onSubmitted) { try { opts.onSubmitted(m.payload); } catch { } }
      };
      w.addEventListener("message", onMessage);
      if (typeof w.ResizeObserver === "function") { ro = new w.ResizeObserver(() => { if (heightOf() !== h0) loaded(); }); ro.observe(iframe); }
      if (typeof w.IntersectionObserver === "function") {
        io = new w.IntersectionObserver(entries => { if (entries.some(x => x.isIntersecting)) { if (io) io.disconnect(); io = null; start(); } });
        io.observe(iframe);
      } else start();
    } catch { native("error"); }
    return handle;
  }

  return { KINDS, SURFACES, HIDDEN, NAMES, FALLBACK_MS, SCRIPT, surfaceOf, sourceOf, kindOf, submittedEvent, themeOf, formIdFor, embedSrc, embedHtml,
    freshState, loadedCheck, markLoaded, shouldFallback, readMessage, returnQuery, clearQuery, nativeSubmit, mount };
});
