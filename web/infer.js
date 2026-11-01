/* Infer: the model read of a resume, from the browser (2026-11-01). The patterns of web/match.js credit the skills a
   resume names; /api/infer (web/api/infer.js) asks a model for the ones it shows without naming them. A classic
   script like capture.js, loaded after match.js; node requires it for tests/web/infer.test.mjs with its dependencies
   passed in: require("web/infer.js")({ fetch, config, storage }).

     Infer.read(text, found, set) -> Promise<[{ id, line, why }]>
       found: the skill ids the patterns already credit (Atlas.roughFit's `shown`); set: "both" | "mba" | "product".
       Off (CONFIG.INFER_ENABLED false), no route (the local python server has no /api), a 503 (no key on the host),
       a timeout or any error: [] and quiet, so the site reads the patterns alone and nothing breaks.
     Infer.forget()  drops the saved answers (the lines they quote are the person's)

   One upload is one call: the answer is saved in localStorage under a hash of the text (and the set), so the same
   resume read again, on any screen or after a reload, never calls twice. The text leaves the browser in that one
   call and is not stored by the route; the privacy lines beside each resume drop zone and About say so (web/copy.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/infer.js")({ fetch, config, storage })
  else root.Infer = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, storage: () => root.localStorage });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const ROUTE = "api/infer";            // relative, like every path of the site (README, "Hosting")
  const CACHE_KEY = "infer.answers";    // { key: { at, list } }, the newest KEEP kept
  const VERSION = 1;                    // bump with a change to the prompt (web/api/infer.js, PROMPT): old answers are re-asked
  const KEEP = 5, MAX = 12, TIMEOUT_MS = 20000, SETS = new Set(["both", "mba", "product"]);
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const store = () => { try { return (deps.storage && deps.storage()) || null; } catch { return null; } };
  let absent = false;                   // the route answered 404/405/501/503 once: not asked again this page load

  // cyrb53: a fast 53-bit string hash, as hex. A cache key, not a secret: the text itself is never stored under it.
  function hash(text) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const s = String(text || "");
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  const keyOf = (text, set = "both") => `v${VERSION}.${SETS.has(set) ? set : "both"}.${hash(String(text || "").trim())}`;
  // the body the route reads: the text as read, the found ids once each in a stable order, a known set
  const request = (text, found, set = "both") => ({ text: String(text || ""), found: [...new Set((found ? [...found] : []).filter(x => typeof x === "string"))].sort(), set: SETS.has(set) ? set : "both" });
  // an answer as the screens read it: well-formed items only, ids once each, at most MAX (the route validates the
  // ids against the taxonomy and the lines against the text; this guards the shape of whatever comes back or was saved)
  function clean(answer) {
    const items = Array.isArray(answer) ? answer : answer && Array.isArray(answer.inferred) ? answer.inferred : [];
    const seen = new Set(), out = [];
    for (const x of items) {
      if (!x || typeof x.id !== "string" || !/^[a-z0-9_]{1,60}$/.test(x.id) || seen.has(x.id) || typeof x.line !== "string" || !x.line.trim()) continue;
      seen.add(x.id); out.push({ id: x.id, line: x.line.trim().slice(0, 240), why: typeof x.why === "string" ? x.why.trim().slice(0, 200) : "" });
      if (out.length >= MAX) break;
    }
    return out;
  }
  function loadCache() { const s = store(); if (!s) return {}; try { const v = JSON.parse(s.getItem(CACHE_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
  function saveCache(c) {
    const s = store(); if (!s) return;
    const kept = Object.entries(c).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, KEEP);
    try { s.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { }
  }
  const cached = (text, set) => { const hit = loadCache()[keyOf(text, set)]; return hit && Array.isArray(hit.list) ? clean(hit.list) : null; };
  function remember(text, set, list) { const c = loadCache(); c[keyOf(text, set)] = { at: Date.now(), list }; saveCache(c); }
  function forget() { const s = store(); if (s) try { s.removeItem(CACHE_KEY); } catch { } }
  const enabled = () => !!cfg().INFER_ENABLED;

  async function read(text, found, set = "both") {
    try {
      if (!enabled() || !text || !String(text).trim()) return [];
      const hit = cached(text, set); if (hit) return hit;
      if (absent || !deps.fetch) return [];
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
      let r;
      try { r = await deps.fetch(ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request(text, found, set)), signal: ctl ? ctl.signal : undefined }); }
      finally { if (timer) clearTimeout(timer); }
      if ([404, 405, 501, 503].includes(r.status)) { absent = true; return []; }
      if (!r.ok) return [];
      const list = clean(await r.json());
      remember(text, set, list);    // an empty answer is an answer too: the same resume is not asked again
      return list;
    } catch { return []; }
  }

  return { read, forget, request, clean, hash, keyOf, cached, ROUTE, CACHE_KEY, VERSION, MAX, _reset: () => { absent = false; } };
});
