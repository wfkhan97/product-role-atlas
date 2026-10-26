/* The Spring 2027 catalog: the Supabase client, the reads, and the pure functions behind the class cards (cross-list
   collapsing, the grading chip, the eligibility filter, the relevance band, a minimal markdown reader). Pure parts
   take no DOM and load in node (tests/web/classes.test.mjs): require("web/catalog.js")({}) gives the functions.
   What never leaves the browser: the program, the student's own ratings, the role chosen. What never reaches the
   screen: classes.roster_syllabus_md (matcher input only) and classes.research_note_md (never read). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/catalog.js")({ ...deps })
  else root.Catalog = factory({ supabase: () => root.supabase, config: () => root.CONFIG || {}, load: url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }), storage: () => root.localStorage });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CORNELL = /@cornell\.edu$/i;
  const isCornell = email => CORNELL.test(String(email || "").trim());
  const BANDS = ["low", "medium", "high"];
  // the columns the picker reads; research_note_md is never selected, roster_syllabus_md only as matcher input
  const CLASS_COLS = "code,subject,catalog_nbr,title,career,description,outcomes,prereq,credits,grading_basis,location_scope,eligibility_category,enrollment_limited_to,also_in_ithaca,roster_url,roster_syllabus_read,sp27_instructor_matches_syllabus,grading_summary,roster_syllabus_md,last_scraped";
  const PROF_COLS = "slug,name,identity,title,affiliation,expertise,official_profile_url,personal_site_url,scholar_url,linkedin_url,profile_md";

  // ---------- the client and the session ----------
  let client = null;
  function sb() {
    if (client) return client;
    const lib = deps.supabase && deps.supabase(), cfg = deps.config ? deps.config() : {};
    if (!lib || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) return null;
    // PKCE keeps the sign-in code in the query string (?code=), away from the hash this site routes on
    client = lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
    return client;
  }
  async function session() {
    const c = sb(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data && data.session || null; } catch { return null; }
  }
  // a signed-in account that is not cornell.edu is signed out again; the reason is kept for the sign-in screen
  let authNote = null;
  async function enforceCornell(s) {
    if (!s || !s.user) return s;
    if (isCornell(s.user.email)) return s;
    authNote = `${s.user.email || "That account"} is not a cornell.edu address, so it was signed out. Use your Cornell email.`;
    try { await sb().auth.signOut(); } catch { }
    return null;
  }
  const authListeners = new Set();
  function onAuth(fn) {
    authListeners.add(fn);
    const c = sb();
    if (c && !onAuth.wired) { onAuth.wired = true; c.auth.onAuthStateChange(async (ev, s) => { const ok = await enforceCornell(s); authListeners.forEach(f => { try { f(ok, ev); } catch (e) { console.error(e); } }); }); }
    return () => authListeners.delete(fn);
  }
  // any sign-in lands on the picker
  const redirectTo = () => (typeof location !== "undefined" ? location.origin + location.pathname + "#/classes" : undefined);
  async function signInGoogle() {
    const c = sb(); if (!c) throw new Error("Sign in is not configured on this page");
    const { error } = await c.auth.signInWithOAuth({ provider: "google", options: { queryParams: { hd: "cornell.edu" }, redirectTo: redirectTo() } });
    if (error) throw error;
  }
  async function signInEmail(email) {
    const c = sb(); if (!c) throw new Error("Sign in is not configured on this page");
    if (!isCornell(email)) throw new Error("Use an address that ends in @cornell.edu");
    const { error } = await c.auth.signInWithOtp({ email: String(email).trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) throw error;
  }
  async function signOut() { const c = sb(); if (c) await c.auth.signOut(); }
  const takeAuthNote = () => { const n = authNote; authNote = null; return n; };

  // ---------- the reads: one load per page, kept until the page reloads ----------
  async function all(table, cols, order) {
    const c = sb(); if (!c) throw new Error("The catalog client did not load");
    const out = []; const step = 1000;
    for (let from = 0; ; from += step) {
      let q = c.from(table).select(cols).range(from, from + step - 1);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < step) return out;
    }
  }
  let catalogP = null;
  function loadCatalog() {
    return catalogP ||= (async () => {
      try {
        const [classes, crosslists, sections, meetings, instructors, priors, log] = await Promise.all([
          all("classes", CLASS_COLS, "code"), all("class_crosslists", "code,other_code"), all("sections", "class_nbr,class_code,component,section,location,instruction_mode,topic,open_status,start_dt,end_dt,session,credits,notes", "class_nbr"),
          all("meetings", "id,class_nbr,pattern,time_start,time_end,facility", "id"), all("class_instructors", "class_code,instructor_name,professor_slug,term"), all("prior_offerings", "class_code,term,title,instructors,locations,sections"), all("rescrape_log", "scraped_on", "scraped_on"),
        ]);
        const rosterDate = log.map(r => r.scraped_on).sort().pop() || null;
        return { classes, crosslists, sections, meetings, instructors, priors, rosterDate };
      } catch (e) { catalogP = null; throw e; }
    })();
  }
  const profP = {};
  function loadProfessor(slug) {
    return profP[slug] ||= (async () => {
      try {
        const c = sb(); if (!c) throw new Error("The catalog client did not load");
        const [{ data: profs, error: e1 }, { data: taught, error: e2 }] = await Promise.all([
          c.from("professors").select(PROF_COLS).eq("slug", slug).limit(1),
          c.from("class_instructors").select("class_code,term,classes(code,title)").eq("professor_slug", slug),
        ]);
        if (e1) throw new Error(`professors: ${e1.message}`);
        if (e2) throw new Error(`class_instructors: ${e2.message}`);
        return { professor: (profs || [])[0] || null, classes: (taught || []).map(t => ({ code: t.class_code, term: t.term, title: t.classes && t.classes.title || "" })).sort((a, b) => a.code.localeCompare(b.code)) };
      } catch (e) { delete profP[slug]; throw e; }
    })();
  }
  let campusP = null;
  const campus = () => campusP ||= Promise.resolve(deps.load ? deps.load("data/sp27_campus.json") : null).catch(e => { campusP = null; throw e; });

  // ---------- cards: cross-listed classes collapse into one, keyed by the first code alphabetically ----------
  function collapse(data) {
    const { classes = [], crosslists = [], sections = [], meetings = [], instructors = [], priors = [] } = data || {};
    const byCode = Object.fromEntries(classes.map(c => [c.code, c]));
    const parent = {}; const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (const c of classes) parent[c.code] = c.code;
    const outside = {};   // codes a class is also listed under that are not in the dataset
    for (const x of crosslists) {
      if (!byCode[x.code]) continue;
      if (byCode[x.other_code]) { const a = find(x.code), b = find(x.other_code); if (a !== b) parent[a < b ? b : a] = a < b ? a : b; }
      else (outside[x.code] ||= new Set()).add(x.other_code);
    }
    const groups = {};
    for (const c of classes) (groups[find(c.code)] ||= []).push(c);
    const meetBy = {}; for (const m of meetings) (meetBy[m.class_nbr] ||= []).push(m);
    const secBy = {}; for (const s of sections) (secBy[s.class_code] ||= []).push(s);
    const insBy = {}; for (const i of instructors) (insBy[i.class_code] ||= []).push(i);
    const priBy = {}; for (const p of priors) (priBy[p.class_code] ||= []).push(p);
    const cards = Object.values(groups).map(list => {
      list.sort((a, b) => a.code.localeCompare(b.code));
      const codes = list.map(c => c.code), key = codes[0], primary = list[0];
      const other = [...new Set(list.flatMap(c => [...(outside[c.code] || [])]))].filter(o => !codes.includes(o)).sort();
      const seen = new Set(), secs = [];
      for (const c of list) for (const s of secBy[c.code] || []) { if (seen.has(s.class_nbr)) continue; seen.add(s.class_nbr); secs.push({ ...s, meetings: (meetBy[s.class_nbr] || []).slice() }); }
      secs.sort((a, b) => a.class_nbr - b.class_nbr);
      const ins = []; const seenIns = new Set();
      for (const c of list) for (const i of insBy[c.code] || []) { const k = i.instructor_name.toLowerCase(); if (seenIns.has(k)) continue; seenIns.add(k); ins.push({ name: i.instructor_name, slug: i.professor_slug || null }); }
      const pri = []; const seenPri = new Set();
      for (const c of list) for (const p of priBy[c.code] || []) { const k = p.term + "|" + (p.instructors || []).join(","); if (seenPri.has(k)) continue; seenPri.add(k); pri.push(p); }
      return { key, codes, otherCodes: other, classes: list, primary, title: primary.title, credits: primary.credits, sections: secs, instructors: ins, priors: pri, subjects: [...new Set(list.map(c => c.subject))] };
    });
    return cards.sort((a, b) => a.key.localeCompare(b.key));
  }

  // ---------- what a card says ----------
  // the prior-term grading chip, three cases: a roster syllabus was read; a public breakdown without one; neither
  function gradingChip(cls) {
    const read = cls.roster_syllabus_read, m = cls.sp27_instructor_matches_syllabus, sum = (cls.grading_summary || "").trim();
    if (read) {
      const who = m === "same" || m === "partial" || m === "different" ? `${m} instructor` : "instructor match unknown";
      return { text: `Prior term · ${read} · ${who}`, summary: sum, caveat: m === "different" ? "structure example, not a prediction" : "" };
    }
    if (sum) return { text: sum, summary: "", caveat: "" };
    return { text: "No prior syllabus on the roster.", summary: "", caveat: "" };
  }
  const eligibilityLabel = (cat, campusData) => ((campusData && campusData.eligibility) || {})[cat == null ? "null" : cat] || (cat == null ? "eligibility not verified" : String(cat).replace(/_/g, " "));
  // the default filter: classes a program may enroll in, plus the ones with no restriction listed; no program, everything
  function openTo(card, program) {
    if (!program) return true;
    const cats = new Set([...(program.categories || []), "no_enrollment_restriction_listed"]);
    return card.classes.some(c => cats.has(c.eligibility_category));
  }
  function filterCards(cards, { program = null, showAll = false, subject = null, q = "", coversGap = false, covered = null } = {}) {
    const needle = String(q || "").trim().toLowerCase();
    return cards.filter(c => (showAll || openTo(c, program))
      && (!coversGap || ((covered || {})[c.key] || []).length)
      && (!subject || c.subjects.includes(subject))
      && (!needle || c.codes.some(k => k.toLowerCase().includes(needle)) || c.title.toLowerCase().includes(needle)));
  }
  // meeting lines: "MW 10:10–11:25 · Bloomberg 061" per section, DIS/LAB marked
  const timeOf = (a, b) => a && b ? `${a}–${b}` : a || b || "";
  function meetingLines(sections) {
    const out = [];
    for (const s of sections) {
      const comp = s.component && s.component !== "LEC" ? `${s.component} ` : "";
      const ms = (s.meetings || []).length ? s.meetings : [{}];
      for (const m of ms) {
        const bits = [m.pattern, timeOf(m.time_start, m.time_end), m.facility].filter(Boolean).join(" · ");
        out.push((comp + (bits || "time to be announced")).trim());
      }
    }
    return [...new Set(out)];
  }
  // the matcher's input for a class: the roster text plus the prior-term syllabus digest, which is never shown
  const matcherText = cls => [cls.description, cls.outcomes, cls.roster_syllabus_md].filter(Boolean).join("\n");
  const cardText = card => card.classes.map(matcherText).join("\n");

  // ---------- relevance: the share of a role's core and common asks the text names, read as a band ----------
  // rows: [{ id, name, tier: "core" | "common" | other, w }]; found: a Set of skill ids the text names
  function relevanceScore(found, rows) {
    const use = (rows || []).filter(r => r.tier === "core" || r.tier === "common");
    const total = use.reduce((a, r) => a + (r.w || 0), 0);
    if (!total) return { score: 0, matched: [] };
    const matched = use.filter(r => found && found.has(r.id)).sort((a, b) => a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : 1);
    return { score: matched.reduce((a, r) => a + (r.w || 0), 0) / total, matched };
  }
  function relevanceBand(score, thresholds) {
    const t = thresholds || {}; const hi = Number(t.high), md = Number(t.medium);
    if (!(hi > 0) || !(md > 0)) return "low";
    return score >= hi ? "high" : score >= md ? "medium" : "low";
  }
  // the grid rows of a role as the scorer reads them: core (rows[0]) and common (rows[1]), weighted by share
  const rowsOf = grid => [...grid.rows[0].flat().map(x => ({ id: x.id, name: x.name, tier: "core", w: x.share })), ...grid.rows[1].flat().map(x => ({ id: x.id, name: x.name, tier: "common", w: x.share }))];

  // ---------- the person's gaps (PLAN.md v16, step 3): which of them a course covers ----------
  // gaps: the fit's gap rows for the role, [{ id, name, tier, w }]; teaches: the Set of skill ids a course can show
  // (Atlas.readCourse's `teaches`, by kind: a behaviour or a practice the text names is never a covered gap)
  function gapsCovered(teaches, gaps) {
    if (!teaches || !gaps) return [];
    return gaps.filter(g => teaches.has(g.id)).sort((a, b) => a.tier === b.tier ? (b.w || 0) - (a.w || 0) : a.tier === "core" ? -1 : 1);
  }
  const coverLine = (covered, total) => !total ? "" : covered.length ? `Covers ${covered.length} of your ${total} gaps: ${covered.map(g => g.name).join(", ")}` : `Covers none of your ${total} gaps`;
  // sorts: code (the roster's order), relevance (the band, high first), gaps (core gaps covered, then every gap covered);
  // info[key] = { band, covered } as the screen holds them
  const BAND_RANK = { high: 0, medium: 1, low: 2 };
  function sortCards(cards, mode, info) {
    const inf = k => (info && info[k]) || {};
    const byCode = (a, b) => a.key.localeCompare(b.key);
    const core = c => (inf(c.key).covered || []).filter(g => g.tier === "core").length, all = c => (inf(c.key).covered || []).length;
    if (mode === "relevance") return cards.slice().sort((a, b) => ((BAND_RANK[inf(a.key).band] ?? 3) - (BAND_RANK[inf(b.key).band] ?? 3)) || byCode(a, b));
    if (mode === "gaps") return cards.slice().sort((a, b) => (core(b) - core(a)) || (all(b) - all(a)) || byCode(a, b));
    return cards.slice().sort(byCode);
  }
  // the n courses that cover the most core gaps (then the most gaps), for the rail; a course covering nothing is never one
  const topCovering = (cards, info, n) => sortCards(cards, "gaps", info).filter(c => ((info[c.key] || {}).covered || []).length).slice(0, n || 3);

  // ---------- the card's html (pure: the screen wires the handlers) ----------
  const RELS = { low: "thin", medium: "amber", high: "good" };
  const bandTag = (b, extra) => `<span class="tag ${RELS[b] || "thin"}${extra ? " " + extra : ""}">${esc(b)}</span>`;
  function cardHtml(card, o) {
    o = o || {};
    const cm = o.campus || {};
    const codes = card.codes.concat(card.otherCodes || []).join(" / ");
    const who = card.instructors.length ? card.instructors.map(i => i.slug ? `<a href="#/professor/${encodeURIComponent(i.slug)}" data-prof>${esc(i.name)}</a>` : esc(i.name)).join(", ") : "Instructor to be announced";
    const elig = [...new Set(card.classes.map(c => eligibilityLabel(c.eligibility_category, cm)))].join(" · ");
    const chip = gradingChip(card.primary);
    const grading = `<p class="small cls-grading"><span class="muted">${esc(chip.text)}</span>${chip.summary ? ` ${esc(chip.summary)}` : ""}${chip.caveat ? ` <span class="muted">(${esc(chip.caveat)})</span>` : ""}</p>`;
    const rel = o.rel;   // { band, matched: [{name, tier}] } | "pending" | null
    const product = !o.roleId ? `<span class="small muted">pick a role to rate</span>` : rel === "pending" || !rel ? `<span class="small muted">reading…</span>` : bandTag(rel.band) +
      (rel.matched.length ? `<details class="disc small cls-why" data-why="${esc(card.key)}"${o.whyOpen ? " open" : ""}><summary>Why</summary><div class="disc-body"><div class="tags">${rel.matched.map(m => `<span class="tag${m.tier === "core" ? " good" : ""}">${esc(m.name)}</span>`).join("")}</div><p class="small muted">Read from the roster text; a course can teach a skill without naming it.</p></div></details>` : `<p class="small muted">None of the role's main asks named.</p>`);
    // the person's gaps this course covers (o.gaps: { covered: [{ name, tier }], total }), read by kind
    const gaps = o.gaps && o.gaps.total ? `<p class="small cls-gaps${o.gaps.covered.length ? "" : " muted"}">${esc(coverLine(o.gaps.covered, o.gaps.total))}</p>` : "";
    const own = o.own || null;
    const ownCtl = `<div class="chips cls-own" role="group" aria-label="Your rating">${BANDS.map(b => `<button type="button" class="chip${own === b ? " on" : ""}" data-own="${esc(card.key)}" data-val="${b}">${b}</button>`).join("")}</div>`;
    return `<article class="cls-card${o.selected ? " on" : ""}" data-card="${esc(card.key)}">
      <div class="cls-main">
        <button type="button" class="cls-open linkish" data-open="${esc(card.key)}"><span class="cls-codes">${esc(codes)}</span> <span class="cls-title">${esc(card.title)}</span></button>
        <p class="facts">${esc(card.credits ? card.credits + " credits" : "credits not listed")}${meetingLines(card.sections).map(l => " · " + esc(l)).join("")}</p>
        <p class="small">${who}</p>
        <p class="small"><span class="tag thin">${esc(elig)}</span></p>
        ${grading}
      </div>
      <div class="cls-rel"><p class="eyebrow">GradBuddy</p><p class="small muted">from the course description</p>${product}${gaps}</div>
      <div class="cls-rel"><p class="eyebrow">You</p>${ownCtl}</div>
    </article>`;
  }

  // ---------- a minimal markdown reader: ## sections, bullets, links, paragraphs ----------
  function mdSections(md) {
    const out = {}; let cur = "_"; out[cur] = [];
    for (const line of String(md || "").split(/\r?\n/)) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { cur = h[1].trim(); out[cur] = out[cur] || []; continue; }
      if (/^#\s/.test(line)) continue;   // the title line
      out[cur].push(line);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()]));
  }
  const inlineMd = t => esc(t).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  function mdHtml(md) {
    const blocks = [], lines = String(md || "").split(/\r?\n/); let para = [], list = [];
    const flush = () => { if (para.length) { blocks.push(`<p>${inlineMd(para.join(" "))}</p>`); para = []; } if (list.length) { blocks.push(`<ul class="plain">${list.map(l => `<li>${inlineMd(l)}</li>`).join("")}</ul>`); list = []; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (/^#{1,6}\s/.test(line)) { flush(); blocks.push(`<h3>${inlineMd(line.replace(/^#+\s*/, ""))}</h3>`); continue; }
      const li = line.match(/^[-*•]\s+(.*)$/);
      if (li) { if (para.length) flush(); list.push(li[1]); continue; }
      if (list.length) flush();
      para.push(line);
    }
    flush();
    return blocks.join("");
  }

  return { esc, isCornell, BANDS, sb, session, onAuth, signInGoogle, signInEmail, signOut, takeAuthNote, loadCatalog, loadProfessor, campus, collapse, gradingChip, eligibilityLabel, openTo, filterCards, meetingLines, matcherText, cardText, relevanceScore, relevanceBand, rowsOf, gapsCovered, coverLine, sortCards, topCovering, cardHtml, mdSections, mdHtml };
});
