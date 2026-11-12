/* Preview: the two portfolio projects the open tree shows under it (2026-11-11, behind CONFIG.OPEN_TREE_ENABLED), and
   the booking link under them. Pure: no DOM, no network, no model. A classic script that also loads in node,
   require("web/preview.js"), the way map.js does.
     pick(map, { standards, skillById })   up to two { id, title, text, skills: [names], from: "standards" | "tree" }
     bookingHref(formId, { email, role })  the Tally form's address, or null when the id is not one
     hasDuration(text)                     whether a text states a length of time
   Where an option comes from. First the standards index as published (web/data/standards.json: per role, what its
   hiring loop asks a person to show): the shows of the tree's role, ranked by how much of what the tree says the
   person still has to build or evidence each one practises (the sum of those skills' posting shares), a `build` show
   before a `foundation` one on a tie, then the file's order. The title is the show's first artifact, the text its
   `means`. When the role has no entry, or one show, the tree itself fills the rest: a skill the person has to build
   whose evidence form is an artifact (data/taxonomy*.json, how_shown), titled by that artifact, with what the skill
   means. Nothing here is a plan: no steps, no tools, no prompt, and no option that states a length of time
   (hasDuration; the owner's rule of 2026-11-10 against unverified estimates). The same tree and the same files give
   the same two options. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Preview = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MAX = 2;
  const FORM_RE = /^[A-Za-z0-9]{4,12}$/;
  const DURATION_RE = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|half an?)[\s-]*(?:second|minute|hour|day|week|weekend|month)s?\b/i;
  const hasDuration = text => DURATION_RE.test(String(text || ""));
  const shown = st => st === "shows" || st === "shows in other words";
  const cap = s => { const t = String(s || "").trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };

  // every skill of the tree, once: the nodes, the ways of working and the rest of the role's skills
  function treeSkills(map) {
    const T = (map && map.tree) || {}, role = ((map && map.role) || {}).id, out = new Map();
    for (const n of [...(T.nodes || []), ...(T.behaviours || []), ...(T.more || [])]) {
      if (!n || !n.id || out.has(n.id)) continue;
      const sh = n.share && typeof n.share === "object" ? (n.share[role] != null ? n.share[role] : Math.max(0, ...Object.values(n.share))) : 0;
      out.set(n.id, { id: n.id, name: n.name || n.id, need: !shown(n.state), share: Number.isFinite(sh) ? sh : 0 });
    }
    return out;
  }
  // the standards entry of a role: its own, or the entry that names it under also_serves
  function entryFor(standards, roleId) {
    const R = (standards && standards.roles) || {};
    roleId = String(roleId || "").replace(/^product\./, "");   // the product set's product.pm is the index's pm
    if (R[roleId]) return R[roleId];
    for (const k of Object.keys(R)) if ((R[k].also_serves || []).includes(roleId)) return R[k];
    return null;
  }
  function fromStandards(entry, skills) {
    const rows = [];
    ((entry && entry.shows) || []).forEach((s, i) => {
      const title = (s.artifacts || []).find(a => a && !hasDuration(a));
      if (!title || !s.means || hasDuration(s.means)) return;
      const hit = (s.skills || []).map(id => skills.get(id)).filter(k => k && k.need);
      rows.push({ id: s.id, title: cap(title), text: s.means, skills: hit.sort((a, b) => b.share - a.share).map(k => k.name).slice(0, 3), from: "standards",
        score: hit.reduce((n, k) => n + Math.max(k.share, 0.05), 0), build: s.stage === "build" ? 1 : 0, i });
    });
    return rows.sort((a, b) => b.score - a.score || b.build - a.build || a.i - b.i);
  }
  function fromTree(skills, skillById) {
    const rows = [];
    for (const k of skills.values()) {
      const s = (skillById || {})[k.id], h = s && s.how_shown;
      if (!s || !h || h.form !== "artifact" || !s.what || hasDuration(s.what)) continue;
      const title = (h.artefacts || []).find(a => a && !hasDuration(a));
      if (title) rows.push({ id: k.id, title: cap(title), text: s.what, skills: [k.name], from: "tree", need: k.need ? 1 : 0, share: k.share });
    }
    return rows.sort((a, b) => b.need - a.need || b.share - a.share || (a.id < b.id ? -1 : 1));
  }
  function pick(map, { standards = null, skillById = null } = {}) {
    if (!map || !map.role || !map.tree) return [];
    const skills = treeSkills(map);
    const out = fromStandards(entryFor(standards, map.role.id), skills).slice(0, MAX);
    if (out.length < MAX) {
      const titles = new Set(out.map(o => o.title.toLowerCase()));
      for (const o of fromTree(skills, skillById)) { if (out.length >= MAX) break; if (!titles.has(o.title.toLowerCase())) { titles.add(o.title.toLowerCase()); out.push(o); } }
    }
    return out.map(({ id, title, text, skills: names, from }) => ({ id, title, text, skills: names, from }));
  }
  // The booking form (CONFIG.BOOKING_TALLY, null until the owner makes it): Tally's own page, with the hidden fields the
  // other forms carry (web/doors.js HIDDEN). No id, or a string that is not one: null, and the card is not drawn.
  function bookingHref(formId, { email = "", role = "" } = {}) {
    if (typeof formId !== "string" || !FORM_RE.test(formId)) return null;
    const q = new URLSearchParams({ surface: "build", source: "open_tree" });
    if (role) q.set("role", String(role).slice(0, 80));
    if (email) q.set("email", String(email).slice(0, 320));
    return `https://tally.so/r/${formId}?${q}`;
  }
  return { pick, bookingHref, hasDuration, entryFor, MAX };
});
