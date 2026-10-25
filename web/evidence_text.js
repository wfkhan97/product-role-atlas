/* Product Role Atlas — the sentences a screen shows about a skill, built from the data files (PLAN.md v14, decision 2).
   Pure logic, no DOM. Loaded as a classic script in the browser (window.EvidenceText) and required from node by the
   tests and evals/adaptive.mjs. No sentence about a skill is written in a screen: every one is built here from
   `kind`, `how_shown` (pipeline/evidence.json), `fields[<field>]` (pipeline/fields.json), the kinds table
   (`meta.kinds` of the index) and, until they retire, the product skills' `signals`.

   EvidenceText.create({ kinds }) -> {
     line(skill, field)        the example resume line: the field entry's line, else signals[0], else a template from
                               how_shown by the kind's form with its slots named and no number invented. `field` is a
                               key of `fields` or a list of keys tried in order (a role override "role:<id>" first)
     reads(skill, field)       what the skill means in the field (fields[field].reads_as), or null
     gap(row, skill, ctx)      what to do about a gap, by kind; a behaviour names the carriers to show it through
     thin(skill)               "add a number": the measures of how_shown
     sayIt(skill, field)       for a skill shown in another field's words: the reading and the field's line
     how(kind)                 the kind's one rule
   }
   A `skill` is a node of the graph (id, name, kind, how_shown, fields, signals). A `row` is a row of the matcher
   (slot, kind, status, carriers, through, throughName). `ctx` is { shown: Set of skill ids the resume shows,
   nameOf: id -> name, counterparts?: [..] }. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EvidenceText = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const list = (xs, n = 2) => (xs || []).slice(0, n).join(", ");
  const first = xs => (xs || [])[0] || null;
  const or = (a, b) => (a != null && a !== "" ? a : b);
  // a slot with nothing to fill it is left out, never printed empty
  const sentence = parts => cap(parts.filter(p => p != null && p !== "").join(" ").replace(/\s+([;,.])/g, "$1").replace(/\s+/g, " ").trim().replace(/[;,]$/, "")) + ".";
  // the article a noun takes in a template ("the roadmap", "a payments product"): artefacts are written as nouns
  const art = (noun, a = "the") => noun ? `${a} ${noun}` : null;

  // The default kinds table, for callers without an index in hand (node tests); the index's meta.kinds wins.
  const KINDS = {
    method: { label: "Craft", form: "artefact", how: "Name the thing you produced and what changed because of it." },
    practice: { label: "Working with people", form: "scope", how: "Say who you worked with, how many, and what you were trusted with." },
    behaviour: { label: "How you work", form: "through", how: "Never a line of its own: let a line about real work show it." },
    technical: { label: "Technical", form: "built", how: "Say what you built, queried, shipped or decided on technical grounds." },
    knowledge: { label: "Domain", form: "context", how: "Name the industry, product or rule set in the lines of work that touched it." },
    tool: { label: "Tools", form: "named", how: "Name the tool inside the line of work that used it, not only in a skills list." },
    credential: { label: "Credentials", form: "named", how: "Name it once, with its date, where a reader looks for it." },
  };

  function create({ kinds } = {}) {
    const K = kinds && Object.keys(kinds).length ? kinds : KINDS;
    const how = kind => ((K[kind] || {}).how) || KINDS.behaviour.how;
    const formOf = skill => (skill.how_shown && skill.how_shown.form) || ((K[skill.kind] || {}).form) || "artefact";
    // `field` is a key of the skill's `fields`, or a list of keys tried in order: the role's own override
    // ("role:<id>", PLAN.md v16 step 6) first, then the role's field
    const entry = (skill, field) => { if (!skill || !skill.fields || !field) return null; for (const k of Array.isArray(field) ? field : [field]) if (k && skill.fields[k]) return { key: k, ...skill.fields[k] }; return null; };

    // A template from how_shown by the form. Slots are named from the lists; no number is invented: the measure is
    // named as the thing to measure ("initiatives shipped against plan"), and the student supplies the figure.
    function template(skill) {
      const h = skill.how_shown || {}; const verb = cap(first(h.verbs) || "built"); const a = first(h.artefacts), c = list(h.counterparts), m = first(h.measures);
      switch (formOf(skill)) {
        case "through": return `${how("behaviour")} For ${skill.name.toLowerCase()}, a line about ${list(h.artefacts, 2) || "the work it showed in"} carries it.`;
        case "scope": return sentence([verb, c || null, a ? `on ${art(a)}` : null, m ? `; ${m}` : null]);
        case "outcome": return sentence([verb, a ? art(a) : null, m ? `; ${m}` : null]);
        case "built": return sentence([verb, a ? art(a) : null, c ? `with ${c}` : null, m ? `; ${m}` : null]);
        case "context": return sentence([verb, a ? art(a, "a") : null, c ? `for ${c}` : null, m ? `; ${m}` : null]);
        case "named": return how(skill.kind || "tool");
        default: return sentence([verb, a ? art(a) : null, c ? `with ${c}` : null, m ? `; ${m}` : null]);
      }
    }

    // The example line, in this order: the field entry, the product skill's signals, the template.
    function line(skill, field) {
      const e = entry(skill, field); if (e && e.line) return { text: e.line, source: "field", field: e.key, role: e.key.startsWith("role:") };
      const sig = first(skill.signals); if (sig) return { text: sig, source: "signals" };
      return { text: template(skill), source: "template" };
    }
    function reads(skill, field) { const e = entry(skill, field); return e && e.reads_as ? e.reads_as : null; }

    // The gap sentence follows the kind's rule and names the skill's own slots.
    function gap(row, skill, ctx = {}) {
      const h = (skill && skill.how_shown) || {}; const kind = (row && row.kind) || (skill && skill.kind) || "method"; const name = (skill && skill.name) || (row && row.slotName) || "it";
      const nameOf = ctx.nameOf || (id => id);
      if (kind === "behaviour") {
        const carriers = (row && row.carriers) || [], shown = ctx.shown || new Set();
        const have = carriers.filter(k => shown.has(k)), need = carriers.filter(k => !shown.has(k)).slice(0, 2);
        if (row && row.status === "through" && row.through) return `Never a line of its own: your line about ${nameOf(row.through)} already shows ${name.toLowerCase()}.`;
        if (have.length) return `Never a line of its own: your line about ${nameOf(have[0])} shows ${name.toLowerCase()} once it carries a result.`;
        if (need.length) return `Never a line of its own. Show it through ${need.map(nameOf).join(" or ")}, which these postings ask for most${row && row.carriersFallback ? " in this field" : ""}.`;
        return `${how("behaviour")} For ${name.toLowerCase()}, a line about ${list(h.artefacts, 2) || "real work"} carries it.`;
      }
      if (kind === "practice") return `Say who you worked with${h.counterparts && h.counterparts.length ? ` (${list(h.counterparts, 3)})` : ""}, how many, and what you were trusted with${h.measures && h.measures.length ? `: ${list(h.measures, 2)}` : ""}.`;
      if (kind === "technical") return `Say what you built or queried${h.artefacts && h.artefacts.length ? `: ${list(h.artefacts, 3)}` : ""}${h.measures && h.measures.length ? `; ${first(h.measures)}` : ""}.`;
      if (kind === "knowledge") return `Name the industry in your lines of work${h.artefacts && h.artefacts.length ? `: ${list(h.artefacts, 2)}` : ""}. One line is enough.`;
      if (kind === "tool") return `Name ${name} inside a line of work that used it, not only in a skills list.`;
      if (kind === "credential") return `Name ${name.toLowerCase()} once, with its date, where a reader looks for it.`;
      // method, and anything else with an artefact
      return `Name the ${first(h.artefacts) || "thing"} you produced and what changed${h.measures && h.measures.length ? `: ${list(h.measures, 2)}` : ""}.`;
    }

    // One sentence for a skill with no field entry: how it is shown, from the evidence file's slots.
    function summary(skill) {
      const h = (skill && skill.how_shown) || {}; const kind = (skill && skill.kind) || "method";
      if (kind === "behaviour") return `${how("behaviour")}${h.artefacts && h.artefacts.length ? ` A line about ${list(h.artefacts, 3)} carries it.` : ""}`;
      if (kind === "tool" || kind === "credential" || formOf(skill) === "named") return how(kind);
      const parts = [h.artefacts && h.artefacts.length ? `Shown by ${list(h.artefacts, 3)}` : null, h.counterparts && h.counterparts.length ? `with ${list(h.counterparts, 3)}` : null, h.measures && h.measures.length ? `; measured by ${list(h.measures, 2)}` : null];
      return parts.some(Boolean) ? sentence(parts) : how(kind);
    }
    function thin(skill) {
      const m = (skill && skill.how_shown && skill.how_shown.measures) || [];
      return m.length ? `Add a number: ${list(m, 3)}.` : "Add a number: how much, how many, or what changed.";
    }
    function sayIt(skill, field) {
      const r = reads(skill, field), l = line(skill, field);
      return { reads: r, line: l.text, source: l.source };
    }
    return { line, reads, gap, thin, sayIt, summary, how, template, kinds: K };
  }

  return { create, KINDS };
});
