/* Explore roles & build skills: the pure parts of the launcher (owner's pick S5, 2026-10-31). The prefix search over
   every role, the fields with their roles by open postings, the three skills most of a role's postings ask for, the
   closest roles for a résumé on file and the light match lines. No DOM, no fetch: every function takes the index
   (`ix` from Atlas.index(), with Atlas.product() loaded when the Product field should carry its roles) or plain
   arrays, and gives structures the screen draws. Loads as a classic script (window.Launcher) and in node
   (require("web/launcher.js")). Nothing here is a score or a percentage: a match reads "N of M".
   The strings are web/copy.js (Copy.skills, the bands Copy.common.bands): COPY here is a view over that table. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));
  else root.Launcher = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const ASKS = 3;   // the skills most of a role's postings ask for, shown on its row
  const BAND_LABEL = Copy.common.bands;

  // the launcher's strings (web/copy.js, Copy.skills); {name} slots are filled with fill()
  const COPY = Copy.skills;
  const fill = Copy.fill;
  const fmt = n => Number(n || 0).toLocaleString("en-US");

  // ---------- the prefix search ----------
  // the words of a label: "FP&A Manager" → fp&a, fp, a, manager; so "prod man" finds Product Manager and "fp&a" FP&A Manager
  const words = label => [...new Set(String(label || "").toLowerCase().split(/\s+/).flatMap(w => [w, ...w.split(/[^a-z0-9]+/)]).filter(Boolean))];
  // each typed word is a prefix of a word in the label; an empty query matches nothing
  function matches(role, q) {
    const qs = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!qs.length) return false;
    const ws = role.words || words(role.label);
    return qs.every(w => ws.some(x => x.startsWith(w)));
  }

  // ---------- the fields and their roles ----------
  const byOpen = (a, b) => (b.nOpen || 0) - (a.nOpen || 0) || String(a.label).localeCompare(String(b.label));
  const nameOf = (ix, id) => { const s = ix.skillById && ix.skillById[id]; return s ? s.name : id; };
  const credential = (ix, id) => { const s = ix.skillById && ix.skillById[id]; return !s || s.cluster === "credentials"; };
  // the skills most of a role's postings ask for, as the role page ranks them: defining first, then the asks by share
  const asksOf = (ix, role) => [...(role.definingList || []), ...(role.asks || [])].filter(a => !credential(ix, a.id)).slice(0, ASKS).map(a => nameOf(ix, a.id));
  const fieldOf = g => ({ id: g.id, label: g.label });
  // a role under a field: the label, its open postings, the three skills most of its postings ask for. The row
  // carries the field, because the same role reads differently under another field.
  const roleRow = (ix, role, field) => ({ id: role.id, label: role.label, nOpen: role.nOpen || 0, asks: asksOf(ix, role), field: field ? fieldOf(field) : null });
  // the groups a role is listed under (a role with several fields lists under each)
  const groupsOf = (ix, id) => ix.groups.filter(g => (g.roles || []).includes(id));
  // the fields with their roles sorted by open postings, and the field's open count
  function fields(ix) {
    return ix.groups.map(g => {
      const roles = (g.roles || []).map(id => ix.roles[id]).filter(Boolean).map(r => roleRow(ix, r, g)).sort(byOpen);
      return { id: g.id, label: g.label, roles, nOpen: roles.reduce((a, r) => a + r.nOpen, 0) };
    });
  }
  // the roles a query finds, by open postings, each with the fields it lists under
  function searchRoles(ix, q) {
    const hits = [];
    for (const r of Object.values(ix.roles)) {
      if (!matches(r, q)) continue;
      const gs = groupsOf(ix, r.id);
      hits.push({ ...roleRow(ix, r, gs[0] || null), fields: gs.map(fieldOf) });
    }
    return hits.sort(byOpen);
  }
  const roleCount = ix => Object.keys(ix.roles).length;
  const lead = ix => fill(COPY.lead, { roles: roleCount(ix), fields: ix.groups.length });
  const hitsLine = n => n === 1 ? COPY.hit : fill(COPY.hits, { n });

  // ---------- a résumé on file ----------
  // the core of a match result's rows: the skills most postings ask for (tier core), how many the résumé shows
  const SHOWN = new Set(["evidenced", "transferable", "through", "inferred"]);   // inferred: the model read (web/infer.js)
  function coreOf(rows) {
    const core = (rows || []).filter(x => x.tier === "core");
    const shown = core.filter(x => SHOWN.has(x.status));
    const gaps = core.filter(x => !SHOWN.has(x.status)).sort((a, b) => (b.w || 0) - (a.w || 0));
    return { n: shown.length, m: core.length, shown, gaps };
  }
  // the closest roles: fits as [{ roleId, n, m }], ranked by how many top skills the résumé shows, then the smaller ask
  function closestRoles(ix, fits, n) {
    return (fits || []).filter(f => ix.roles[f.roleId]).map(f => ({ id: f.roleId, label: ix.roles[f.roleId].label, n: f.n, m: f.m, band: f.band || null }))
      .sort((a, b) => b.n - a.n || a.m - b.m || byOpen(ix.roles[a.id], ix.roles[b.id])).slice(0, n == null ? 3 : n);
  }
  // the light match lines for one role: fit as { band, label, n, m } (band from Matcher.bandOf, or null when the
  // role's group has no bands yet). Never a percentage: "N of the M skills most <role> postings ask for".
  function matchLines(fit) {
    const label = fit.label || (fit.role && fit.role.label) || "";
    const band = fit.band || null, bandLabel = BAND_LABEL[band] || null;
    return {
      band, bandLabel,
      bandLine: bandLabel ? fill(COPY.resume.band, { band: bandLabel, role: label }) : null,
      line: fill(COPY.resume.line, { n: fit.n, m: fit.m, role: label, are: fit.n === 1 ? COPY.resume.is : COPY.resume.are }),
      fitLink: fill(COPY.resume.fit, { role: label }),
    };
  }

  return { COPY, BAND_LABEL, ASKS, fill, fmt, words, matches, fields, searchRoles, roleRow, roleCount, lead, hitsLine, coreOf, closestRoles, matchLines };
});
