/* ProjectGuide: the project guide a person downloads from the picked project's page (#/map/projects/<id>, 2026-11-27).
   Pure: no DOM, no network, no model. A classic script that also loads in node, require("web/project_guide.js"), the
   way preview.js does; the browser saves the string as a file (a Blob and a download link, app.js pickedScreen).
     html(card, { kit, role, answers, date, skills })   one self-contained HTML document, as a string
     filename(card, ext)                                a safe file name ending in .html (or .md for the brief)
     brief(card, { kit, role, answers, skills, urls })  the same project as a Markdown brief for an AI assistant
                                                        (Claude, ChatGPT, Codex…): how to coach the person one step
                                                        at a time, then the project; the guide carries it too,
                                                        without the tools' addresses (its own list links them)
     portfolio(card, { kit, answers })                  the "Add it to your portfolio" part: { kind, host, lines, prompt }
     HOSTS                                              each portfolio host id of the kit and its kind: code, builder,
                                                        other (a host the table lacks is "other")
     WORDS                                              every fixed sentence the file says (the copy rule reads them)
     esc(s), safeUrl(u)                                 the escaping every value goes through; an address only when
                                                        it is http(s), else null and the name shows as text
   `card` is a picked project as Quests.cardOf writes it (title, ship, project_level, steps, prompt, build_with,
   live_on, share, why_role, why_person); `role` is { id, label }; `answers` the open flow's answers (portfolio.host,
   portfolio.note); `skills` the names of the skills it builds. The document needs nothing else: inline CSS, a small
   inline script only for the ticks (kept in the file's own localStorage) and the Copy buttons, no font, no image, no
   request. It reads on a phone, prints cleanly and follows the device's light or dark theme. "Add it to your
   portfolio" is written here from the host's template, never by a model. No length of time, no "mission". */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ProjectGuide = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => { const t = String(u == null ? "" : u).trim(); return /^https?:\/\/[^\s"'<>`]+$/i.test(t) ? t : null; };
  const list = x => Array.isArray(x) ? x : [];
  const str = x => typeof x === "string" ? x.trim() : "";
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

  // ---------- the fixed words (the copy rule: short sentences, no passive, no length of time) ----------
  const WORDS = {
    kicker: "Project guide",
    forRole: "For {role}",
    written: "Written {date}",
    levels: { beginner: "Beginner", intermediate: "Intermediate" },
    ship: "What you'll ship",
    builds: "Skills it builds:",
    why: "Why it matters",
    whyRole: "For the role",
    whyYou: "Why it suits you",
    before: "Before you start",
    beforeLead: "Open an account on the tool you build with. These are the ones this project names.",
    yours: "you use this",
    noTools: "Use the tool you know best.",
    steps: "Steps",
    stepsLead: "Tick a step when you finish it. The ticks stay in this browser.",
    prompt: "Your starter prompt",
    promptLead: "Paste it into the tool you build with. Fill in what sits between [ and ].",
    copy: "Copy",
    copyPrompt: "Copy the starter prompt",
    copyPost: "Copy the draft post",
    copyPortfolio: "Copy the prompt for your site",
    copied: "Copied.",
    copyFailed: "Select the text and copy it.",
    live: "Put it where people can see it",
    liveLead: "Give the finished project one public link that opens without a sign-in.",
    portfolio: "Add it to your portfolio",
    yourSite: "Your site: {note}",
    share: "Share it",
    post: "A draft post",
    postLead: "Make it yours before you post it.",
    noShare: "Post the link on LinkedIn with one line on what you built and one screenshot.",
    ready: "Ready to share?",
    readyLead: "Check each one before you send the link to anyone.",
    checks: [
      "It opens without a sign-in. Try the link in a private window.",
      "The first screen says what it is and which role it is for.",
      "Every number on it is one you could defend in an interview.",
      "It reads well on a phone.",
      "Your name and a way to reach you are on it.",
    ],
    foot: "From GradBuddy. This file works offline, and you can print it.",
    // the brief for an AI assistant (brief(), and the guide's own section): the assistant is the coach
    coach: "Work through it with an AI assistant",
    coachLead: "Attach this file to the assistant you use, or copy the brief below into it. It coaches you one step at a time.",
    coachShow: "Show the brief",
    copyBrief: "Copy the brief for your assistant",
    briefTitle: "Project brief: {title}",
    briefIntro: "You are my coach for this portfolio project. Guide me through it one step at a time.",
    briefRole: "I want a job as {role}. This project shows skills that role asks for.",
    briefHow: "How to coach me",
    briefRules: [
      "Start by asking what I have done so far and which tool I am using.",
      "Give me one step at a time. Wait until I say I finished it before the next one.",
      "When I get stuck, ask what I see on my screen, then suggest one fix.",
      "The tools below are the ones I picked. I may want another tool, or the one we are talking in. Then adapt the steps and tell me what changes.",
      "Ask me for any fact about me that you need. Never make one up.",
      "Stay with the project below. Suggest extras only after the last step.",
      "After the last step, help me put it live, add it to my portfolio and write the post.",
      "End with the checks under \"Ready to share\".",
    ],
    briefProject: "The project",
    briefLevel: "Level: {level}",
    briefShip: "What I ship: {ship}",
    briefSkills: "Skills it builds: {skills}",
    briefWhyRole: "Why the role asks for it: {text}",
    briefWhyMe: "Why it suits me: {text}",
    briefTools: "Tools",
    briefSteps: "Steps",
    briefPrompt: "My starter prompt",
    briefPromptLead: "I paste this into the tool I build with.",
    briefLive: "Where it goes live",
    briefPortfolio: "Adding it to my portfolio",
    briefShare: "Sharing it",
    briefPost: "A draft post, to make mine:",
    briefReady: "Ready to share",
    // the portfolio templates: a site in code, a site builder, somewhere else, no site yet
    code: {
      lead: "Your site lives on {host}. Ask the AI tool you built it with to add the project.",
      prompt: "Add one new item to my projects list. Title: \"{title}\". One line: \"{ship}\". Link: [the link to your project]. Change nothing else. Return the full file.",
      promptLead: "Paste this prompt into that tool, with the file that lists your projects.",
      publish: {
        github_pages: "Put the new file in your repository and commit it. GitHub Pages then publishes the change.",
        vercel: "Commit the new file to the repository Vercel builds from. Vercel then publishes a new version.",
        netlify: "Commit the new file to the repository Netlify builds from, or drag the site folder into Netlify again.",
      },
      publishOther: "Commit the new file, then publish the site again.",
      check: "Open your site and check the new item and its link.",
    },
    builder: {
      open: "Open your portfolio in the {host} editor.",
      add: "Add a block or a page for the project. A copy of a project block you have keeps your layout.",
      content: "Put in the title, one line on what it is, a screenshot and the link.",
      publish: {
        notion: "Notion shows your edits on the public page. Open the link in a private window to check it.",
        squarespace: "Save the page, then open your site to check it.",
      },
      publishOther: "Press Publish, then open your site to check it.",
    },
    other: [
      "Add the project where your site lists its work: the title, one line, a screenshot and the link.",
      "Publish or save the change, then open your site to check it.",
    ],
    none: [
      "No portfolio site yet? The project still counts.",
      "Put the link in the Featured section of your LinkedIn profile, with the title and one line.",
      "A one-page portfolio site can be a later project of its own.",
    ],
  };
  // each portfolio host of web/data/build_kit.json and the template it gets
  const HOSTS = {
    github_pages: "code", vercel: "code", netlify: "code",
    notion: "builder", google_sites: "builder", wix: "builder", squarespace: "builder", webflow: "builder", framer: "builder", carrd: "builder",
    other: "other",
  };

  const hostOf = (kit, id) => list((kit || {}).portfolio_hosts).find(h => h.id === id) || null;
  function portfolio(card, { kit = null, answers = null } = {}) {
    const pf = ((answers || {}).portfolio) || {}, id = str(pf.host) || null;
    if (!id) return { kind: "none", host: null, lines: WORDS.none.slice(), prompt: null };
    const h = hostOf(kit, id), label = (h && h.label) || id, kind = HOSTS[id] || "other";
    const c = card || {};
    if (kind === "code") {
      const W = WORDS.code;
      return { kind, host: { id, label }, lines: [fill(W.lead, { host: label }), W.promptLead], prompt: fill(W.prompt, { title: str(c.title), ship: str(c.ship) }), after: [W.publish[id] || W.publishOther, W.check] };
    }
    if (kind === "builder") {
      const W = WORDS.builder;
      return { kind, host: { id, label }, lines: [fill(W.open, { host: label }), W.add, W.content, W.publish[id] || W.publishOther], prompt: null };
    }
    return { kind: "other", host: { id, label }, lines: WORDS.other.slice(), prompt: null };
  }

  const slug = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  const filename = (card, ext = "html") => `project-guide-${slug((card || {}).title) || "project"}.${ext === "md" ? "md" : "html"}`;

  // ---------- the brief: the project as Markdown an AI assistant can coach from ----------
  // Plain text, so nothing is escaped as HTML; a value is flattened to one line (the prompt and the post keep their
  // lines inside a fence) and a line of backticks in a value cannot close the fence.
  const one = s => str(s);
  const fence = s => "````text\n" + String(s == null ? "" : s).replace(/\u0000/g, "").replace(/`{4,}/g, "```").trim() + "\n````";
  function brief(card, { kit = null, role = null, answers = null, skills = null, urls = true } = {}) {
    const c = card || {}, W = WORDS, out = [];
    const roleLabel = str((role || {}).label) || str((role || {}).id), level = W.levels[c.project_level] || "";
    const sk = list(skills).filter(Boolean).map(one);
    out.push(`# ${fill(W.briefTitle, { title: one(c.title) || W.kicker })}`, "", W.briefIntro);
    if (roleLabel) out.push(fill(W.briefRole, { role: one(roleLabel) }));
    out.push("", `## ${W.briefHow}`, ...W.briefRules.map(r => `- ${r}`));
    out.push("", `## ${W.briefProject}`);
    if (level) out.push(`- ${fill(W.briefLevel, { level })}`);
    out.push(`- ${fill(W.briefShip, { ship: one(c.ship) })}`);
    if (sk.length) out.push(`- ${fill(W.briefSkills, { skills: sk.join(", ") })}`);
    if (one((c.why_role || {}).text)) out.push(`- ${fill(W.briefWhyRole, { text: one(c.why_role.text) })}`);
    if (one((c.why_person || {}).text)) out.push(`- ${fill(W.briefWhyMe, { text: one(c.why_person.text) })}`);
    out.push("", `## ${W.briefTools}`);
    const tools = list(c.build_with).flatMap(b => list(b.tools).length ? list(b.tools).map(t => `- ${one(t.name)}${t.own ? ` (${W.yours})` : t.free ? ` (${one(t.free)})` : ""}${urls && safeUrl(t.url) ? `: ${safeUrl(t.url)}` : ""}`) : [`- ${one(b.name)}`]);
    out.push(...(tools.length ? tools : [`- ${W.noTools}`]));
    out.push("", `## ${W.briefSteps}`, ...list(c.steps).map((s, i) => `${i + 1}. ${one(s)}`));
    if (str(c.prompt)) out.push("", `## ${W.briefPrompt}`, W.briefPromptLead, "", fence(c.prompt));
    const live = list(c.live_on).map(l => `- ${one(l.name)}${one(l.note) ? `: ${one(l.note)}` : ""}`);
    if (live.length) out.push("", `## ${W.briefLive}`, ...live);
    const pf = portfolio(c, { kit, answers }), note = one(((answers || {}).portfolio || {}).note);
    out.push("", `## ${W.briefPortfolio}`, ...pf.lines.map(l => `- ${l}`));
    if (pf.prompt) out.push("", fence(pf.prompt), "", ...list(pf.after).map(l => `- ${l}`));
    if (pf.host && note) out.push(`- ${fill(W.yourSite, { note })}`);
    const sh = c.share;
    out.push("", `## ${W.briefShare}`);
    if (sh && (one(sh.how) || one(sh.post))) {
      if (one(sh.how)) out.push(`- ${one(sh.label || sh.place)}: ${one(sh.how)}`);
      if (str(sh.post)) out.push("", W.briefPost, "", fence(sh.post));
    } else out.push(`- ${W.noShare}`);
    out.push("", `## ${W.briefReady}`, ...W.checks.map(t => `- [ ] ${t}`), "");
    return out.join("\n");
  }

  const CSS = `:root{color-scheme:light dark;--bg:#ffffff;--fg:#1d211f;--muted:#59615c;--line:#d8ddd9;--card:#f5f7f6;--accent:#1d7a3d;--tint:#e9f4ec}
@media (prefers-color-scheme:dark){:root{--bg:#131614;--fg:#e7ebe8;--muted:#a2aba5;--line:#2c322e;--card:#1b1f1c;--accent:#72d091;--tint:#1a2a20}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 56px}
h1{font-size:1.8rem;line-height:1.2;margin:6px 0 10px}
h2{font-size:1.2rem;margin:34px 0 8px;padding-top:18px;border-top:1px solid var(--line)}
h3{font-size:1rem;margin:16px 0 4px}
p{margin:0 0 10px}ul,ol{padding-left:22px;margin:0 0 10px}li{margin:4px 0}
a{color:var(--accent);overflow-wrap:anywhere}
.kicker{color:var(--muted);font-size:.9rem;margin:0}
.level{display:inline-block;margin:14px 0 0;padding:2px 10px;border-radius:999px;background:var(--tint);color:var(--accent);font-size:.85rem;font-weight:600}
.muted{color:var(--muted)}
.tag{color:var(--muted);font-size:.9rem}
details{margin:0 0 10px}summary{cursor:pointer;color:var(--accent);min-height:32px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:0 0 8px;font:inherit}
.ticks{list-style:none;padding:0}.ticks li{margin:8px 0}
.ticks label{display:flex;gap:10px;align-items:flex-start;cursor:pointer}
.ticks input{width:20px;height:20px;margin:3px 0 0;flex:none;accent-color:var(--accent)}
.ticks input:checked+span{color:var(--muted);text-decoration:line-through}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 10px}
button{font:inherit;min-height:40px;padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.foot{margin-top:40px;color:var(--muted);font-size:.9rem}
@media print{:root{--bg:#fff;--fg:#000;--muted:#444;--line:#bbb;--card:#fff;--accent:#000;--tint:#fff}button{display:none}main{max-width:none;padding:0}a[href^="http"]::after{content:" (" attr(href) ")";font-size:.85em;color:#444}h2{break-after:avoid}pre,li{break-inside:avoid}}`;

  // the ticks (this file's own localStorage, keyed by its title) and the Copy buttons; no value is written into it
  const SCRIPT = `(function(){var K="project-guide:"+document.title;function get(){try{return JSON.parse(localStorage.getItem(K))||{}}catch(e){return{}}}function put(v){try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}}
var t=get();Array.prototype.forEach.call(document.querySelectorAll("input[data-tick]"),function(b){if(t[b.getAttribute("data-tick")])b.checked=true;b.addEventListener("change",function(){var v=get();v[b.getAttribute("data-tick")]=b.checked;put(v)})});
function pick(el){try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);return document.execCommand("copy")}catch(e){return false}}
Array.prototype.forEach.call(document.querySelectorAll("button[data-copy]"),function(b){b.hidden=false;b.addEventListener("click",function(){var id=b.getAttribute("data-copy"),el=document.getElementById(id),out=document.getElementById(id+"-ok"),txt=el?el.textContent:"";function done(ok){if(out)out.textContent=ok?out.getAttribute("data-ok"):out.getAttribute("data-no")}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){done(true)},function(){done(pick(el))})}else done(pick(el))})})})();`;

  const link = (name, url) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" rel="noopener">${esc(name)}</a>` : esc(name); };
  const copyRow = (id, label) => `<div class="row"><button type="button" data-copy="${id}" hidden>${esc(label)}</button><span class="muted" id="${id}-ok" aria-live="polite" data-ok="${esc(WORDS.copied)}" data-no="${esc(WORDS.copyFailed)}"></span></div>`;
  const paras = xs => list(xs).map(x => `<p>${esc(x)}</p>`).join("");

  function html(card, { kit = null, role = null, answers = null, date = null, skills = null } = {}) {
    const c = card || {}, W = WORDS;
    const roleLabel = str((role || {}).label) || str((role || {}).id);
    const level = W.levels[c.project_level] || "";
    const tools = list(c.build_with).map(b => `<h3>${esc(b.name)}</h3>${list(b.tools).length ? `<ul>${list(b.tools).map(t => `<li>${link(t.name, t.url)}${t.own ? ` <span class="tag">(${esc(W.yours)})</span>` : t.free ? ` <span class="tag">(${esc(t.free)})</span>` : ""}</li>`).join("")}</ul>` : ""}`).join("") || `<p>${esc(W.noTools)}</p>`;
    const live = list(c.live_on).map(l => `<p><b>${link(l.name, l.url)}</b>${str(l.note) ? `: ${esc(l.note)}` : ""}</p>`).join("");
    const pf = portfolio(c, { kit, answers }), note = str(((answers || {}).portfolio || {}).note);
    const pfHtml = `${paras(pf.lines)}${pf.prompt ? `<pre id="g-site">${esc(pf.prompt)}</pre>${copyRow("g-site", W.copyPortfolio)}${paras(pf.after)}` : ""}${pf.host && note ? `<p class="muted">${esc(fill(W.yourSite, { note }))}</p>` : ""}`;
    const sh = c.share;
    const shareHtml = sh && (str(sh.how) || str(sh.post))
      ? `${str(sh.how) ? `<p><b>${link(sh.label || sh.place, sh.url)}</b>: ${esc(sh.how)}</p>` : ""}${str(sh.post) ? `<h3>${esc(W.post)}</h3><p class="muted">${esc(W.postLead)}</p><pre id="g-post">${esc(sh.post)}</pre>${copyRow("g-post", W.copyPost)}` : ""}`
      : `<p>${esc(W.noShare)}</p>`;
    const kick = [W.kicker, roleLabel ? fill(W.forRole, { role: roleLabel }) : "", date ? fill(W.written, { date: String(date) }) : ""].filter(Boolean).map(esc).join(" · ");
    const sk = list(skills).filter(Boolean);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(str(c.title) || W.kicker)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<p class="kicker">${kick}</p>
${level ? `<p class="level">${esc(level)}</p>` : ""}
<h1>${esc(c.title)}</h1>

<h2>${esc(W.ship)}</h2>
<p>${esc(c.ship)}</p>
${sk.length ? `<p class="muted">${esc(W.builds)} ${esc(sk.join(", "))}</p>` : ""}

<h2>${esc(W.coach)}</h2>
<p class="muted">${esc(W.coachLead)}</p>
${copyRow("g-brief", W.copyBrief)}
<details><summary>${esc(W.coachShow)}</summary><pre id="g-brief">${esc(brief(c, { kit, role, answers, skills, urls: false }))}</pre></details>

<h2>${esc(W.why)}</h2>
<h3>${esc(roleLabel ? fill(W.forRole, { role: roleLabel }) : W.whyRole)}</h3>
<p>${esc((c.why_role || {}).text)}</p>
<h3>${esc(W.whyYou)}</h3>
<p>${esc((c.why_person || {}).text)}</p>

<h2>${esc(W.before)}</h2>
<p class="muted">${esc(W.beforeLead)}</p>
${tools}

<h2>${esc(W.steps)}</h2>
<p class="muted">${esc(W.stepsLead)}</p>
<ol class="ticks">${list(c.steps).map((s, i) => `<li><label><input type="checkbox" data-tick="s${i}"> <span>${esc(s)}</span></label></li>`).join("")}</ol>

<h2>${esc(W.prompt)}</h2>
<p class="muted">${esc(W.promptLead)}</p>
<pre id="g-prompt">${esc(c.prompt)}</pre>
${copyRow("g-prompt", W.copyPrompt)}

<h2>${esc(W.live)}</h2>
<p class="muted">${esc(W.liveLead)}</p>
${live}

<h2>${esc(W.portfolio)}</h2>
${pfHtml}

<h2>${esc(W.share)}</h2>
${shareHtml}

<h2>${esc(W.ready)}</h2>
<p class="muted">${esc(W.readyLead)}</p>
<ul class="ticks">${W.checks.map((t, i) => `<li><label><input type="checkbox" data-tick="r${i}"> <span>${esc(t)}</span></label></li>`).join("")}</ul>

<p class="foot">${esc(W.foot)}</p>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
  }
  return { html, brief, filename, portfolio, HOSTS, WORDS, esc, safeUrl, slug };
});
