/* The strings the screens own (v19 B6, "How to write"): one pure table, grouped by screen, that every other script
   reads. Loaded first in index.html (window.Copy); in node, require("web/copy.js"), and launcher.js, network.js,
   jobs.js, gameshell.js and app.js require it themselves when Copy is not on the global.
   The rule, from the brief: sentences of at most 20 words, active voice, simple words (never utilize, leverage,
   facilitate, via, in order to), American spelling, no bare codes, plain-language names, and never a percentage or a
   score in what a person reads about a fit: bands and "N of M". `node evals/copy.mjs` checks every string here, and
   tests/web/copy.test.mjs fails on the first offender.
   What is not here: the sentences web/evidence_text.js builds about a skill from the data, and the lines the screens
   build from the data (counts, "N of M", names), except as templates. A template carries {name} slots and is filled
   with Copy.fill(template, { name: value }); a slot left unfilled stays as it is, so a screen never prints "undefined".
   The pure tables Door.COPY (app.js), Intake (app.js), Launcher.COPY and Network.COPY are views over this table. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Copy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? String(vars[k]) : m);

  // ---------- common: the shell, the forms every screen shares, the bands, the legend ----------
  const common = {
    title: "Role atlas · GradBuddy",
    home: "Home",
    back: "← Back",
    backHome: "← Home",
    close: "Close",
    edit: "Edit",
    editLower: "edit",
    change: "change",
    open: "Open",
    openLower: "open",
    openArrow: "open →",
    done: "Done",
    resetFilters: "Reset filters",   // the role page's filters drawer: every filter back to its default
    all: "All",
    notNow: "Not now",
    loading: "Loading…",
    loadingRoles: "Loading the roles…",
    // the top bar's short labels; Build skills is the map's section (#/map, 2026-11-10), shown to whoever can sign in
    bar: { jobs: "Find jobs", skills: "Explore careers", build: "Build skills", classes: "Find classes", network: "Networking" },
    // the theme button's name (2026-11-08): what a press does. From the device's theme it shows the other one, and
    // the next press follows the device again (Routes.Theme)
    themeTo: "Switch to the {theme} theme",
    themeToDevice: "Follow your device's theme",
    themeNames: { light: "light", dark: "dark" },
    railTab: "Your fit",
    tipLabel: "What this means",
    failHeading: "Something did not load",
    failLine: "{message}. Reload the page. If it happens again, the data files may be missing.",
    noLeave: "Nothing leaves your browser.",
    nOpen: "{n} open",
    // the résumé form: a drop zone and what the reader found (no paste box since 2026-11-01, owner's feedback: a file only)
    resume: {
      drop: "Drop a PDF, DOCX or TXT here",
      dropShort: "Drop a PDF, DOCX or TXT",
      or: "or",
      choose: "choose a file",
      using: "Using {name} ({words} words read).",
      forget: "Forget it",
      forgotten: "Forgotten.",
      // the processing state (owner, 2026-11-01): the drop zone turns into a short list of steps while the file is read,
      // matched and sent once to the model; nothing else on the screen moves until it is done
      steps: { file: "Reading your file", match: "Matching it to the postings", infer: "Finding the skills it shows without naming them" },
      wait: "This takes a few seconds. The screen updates on its own.",
      reading: "Reading {name}…",
      fewWords: "{name}: we read only {words} words. If this is a scan, try a text or DOCX export.",
      read: "{name}: {words} words read.",
      cantRead: "Could not read that file: {message}",
      // the posting and course forms, which keep their paste box (wireFileDrop)
      nothingText: "Add a file or paste some text first.",
      pastedName: "pasted text",   // a pasted posting or course text
    },
    // the bands of fit, in order; never a score
    bands: { different: "New to the field", related: "Relevant foundation", in_range: "Qualified for the role", strong: "Strong match" },
    // the legend on the rail, one row per mark
    legend: {
      heading: "How to read this",
      share: "% of postings that ask for the skill",
      defining: "sets this role apart from other roles",
      grows: "asked more at senior levels",
      have: "already on your résumé",
      gap: "a gap this role requires",
      presumed: "presumed from a role you held, not shown on your résumé",
      known: "you got it right in a game",
      other: "on your résumé in other words; postings say it differently",
      through: "a way of working, shown through a skill on your résumé",
      inferred: "inferred from your experience; the line that suggested it is below",
    },
    // the one intake box's send
    sending: "Sending…",
    sendFailed: "That did not go through. Check the address and try again.",
    // under the door's and a box's Tally form while it loads (web/doors.js, v19 B7); gone once it draws or the native
    // form takes its place
    loadingForm: "Loading the form…",
  };

  // ---------- the door (#/), v19 B2: the owner's words ----------
  const door = {
    heading: "Welcome to GradBuddy.",
    // intro[0] and inside are the owner's words verbatim (2026-11-01), over the 20-word rule: evals/copy_lib.mjs
    // OWNER_WORDS lets exactly these texts through; any edit to them meets the rule again
    intro: ["GradBuddy helps students with the things they care about most: finding jobs, taking advantage of networking opportunities, making classwork relevant, and more.", "We spent the past few weeks on a few of those pieces & we want to share."],
    inside: "Inside: find jobs for grad students, learn what skills different roles require (and how you stack up), search classes by career relevance, and identify people to network with.",
    email: "Your email", emailPlaceholder: "user@school.edu",
    where: "What are you studying?", pick: "Pick one",
    // under the email (2026-11-06): {schools} are the campuses with a loaded roster (app.js Door.schoolLine), the only
    // addresses that open Find classes; no line when no campus has one
    school: "A {schools} email also opens Find classes.",
    button: "Continue", skip: "Skip for now",
    privacy: "We keep your email to send you what we build. Your résumé text goes once to our AI reader; we do not store it.",
  };

  // ---------- home (#/home): the four verbs and Build skills, one line each ----------
  const home = {
    heading: "What do you want to do?",
    // {jobs} and {companies} are counts in words, rounded down (Door.thousands, hundreds); {roles} is the exact count the
    // launcher and Explore say, and lineAll stands in until the product set's roles are counted (2026-11-08)
    verbs: {
      jobs: { title: "Find jobs", line: "Search over {jobs} open jobs in popular fields for grad students, from over {companies} companies." },
      skills: { title: "Explore careers", line: "Explore {roles} roles and see how your experience and skills match up.", lineAll: "Explore every role and see how your experience and skills match up." },
      // the map's card (owner, 2026-11-11), after Explore careers while the tree is on; `invite` follows the line for a
      // visitor with no session while accounts are off, who meets the invited sign-in on a click
      build: { title: "Build skills", line: "Plan portfolio projects that build the skills your target roles ask for. Share what you ship to network and get referrals.", invite: "It opens by invite today." },
      classes: { title: "Find classes", line: "Pick Spring 2027 classes that are relevant to the job you want." },
      network: { title: "Networking", line: "Find the hiring managers, recruiters, alumni and faculty to meet for a role, and what to say." },
    },
    // one line over the cards after #/classes or #/professor sent a visitor home (app.js route(), Door.reach): {schools}
    // are the campuses with a loaded roster (Door.schoolLine's list); the link goes to the door (#/)
    classesOnly: "Find classes is for {schools} email addresses today.",
    classesClosed: "Find classes is not open yet.",
    changeEmail: "Change your email →",
  };

  // ---------- the intake box (v19 B5): the one call to action ----------
  const intake = {
    // the heading names what comes next, per surface (2026-11-06: "GradBuddy is coming soon" read odd on GradBuddy);
    // `heading` is the one Stage.cta reads
    heading: "Next: more help with your search.",
    headings: {
      skills: "Next: projects that build your gaps.",
      network: "Next: events near you.",
      classes: "Next: classes as proof of your skills.",
      positioning: "Next: advice on your résumé.",
    },
    line: {
      skills: "GradBuddy will give you personalized projects. Each one builds a skill you need. Each one aims at the roles, industries and companies you want.",
      network: "GradBuddy will find events near you that fit your role. It will show you who to meet and what to say.",
      classes: "GradBuddy will turn your classes into proof of the skills you need.",
      // the role rail's "Help me improve my positioning" (2026-11-01)
      positioning: "GradBuddy will read your résumé against the roles you want and tell you what to change. It will show you how to say what you have done so it lands.",
    },
    email: "Email",
    button: "Notify me",
    done: "Got it. We will be in touch.",
    privacy: "We keep your email to tell you when it is ready. Nothing else.",
    // the one data-built line over the picker's box, when a role is chosen and the person's fit leaves gaps
    gapsLine: "These are your gaps for {label}. The classes below say which they cover.",
  };

  // ---------- About you (#/you): three questions, the résumé, the summary ----------
  const you = {
    crumb: "About you",
    heading: "About you",
    // the questions, in order: key, title, options as [id, label, examples]; the fields question lists the index's groups
    questions: [
      { key: "where", title: "What are you studying?", options: [["business", "Business, management or finance", "MBA, Tech MBA, Master in Management, Master in Finance"], ["analytics", "Analytics or data science", "MSBA, Business Analytics & AI, Data Science & Decision Analytics, ORIE"], ["cs", "Computer science or software", "MEng CS, software engineering"], ["ece", "Electrical, hardware or systems", "MEng ECE, robotics, embedded"], ["infosci", "Information science, design or health/urban tech", "Connective Media, Health Tech, Urban Tech, MS Design Technology"]] },
      { key: "stage", title: "Where are you in your search?", options: [["looking", "I'm open to roles that fit me", "Show me what I have a shot at"], ["targeting", "I know the role I want", "Show me which of its skills I have and how to fill the gaps"], ["curious", "I just want to explore the jobs and skills data", "No résumé needed"]] },
      { key: "fields", title: "Which fields interest you?", multi: true, hint: "Pick as many as you like, or none." },
    ],
    whereShort: { business: "Business", analytics: "Analytics", cs: "CS", ece: "ECE", infosci: "Info science" },
    stageShort: { looking: "open to roles that fit", targeting: "knows the role", curious: "exploring the data" },
    productExamples: "Product manager · Product marketing",
    next: "Next →",
    addResume: "Add your résumé",
    resumeLead: "We read it in your browser to find the roles that fit what you have done. Its text also goes once to our AI reader; we do not store it.",
    showRoles: "Show my roles →",
    // the résumé step opened from a screen that wants its place back (Find jobs, Networking): a chosen file is kept and
    // the step goes back there; this button goes back with what is on file
    readBack: "Go back →",
    skip: "Skip for now",
    // the summary
    lead: "What you told us and what your résumé shows. Change any answer; the fields below follow.",
    answers: "Your answers",
    study: "What you study",
    stage: "Where you are in your search",
    fields: "Fields you picked",
    notAnswered: "Not answered",
    noFields: "None yet; your résumé decides",
    resume: "Your résumé",
    // the saved state (the visitor journey, step 3, 2026-11-05): what a sign-in keeps, and the button that forgets it
    saved: "Saved to your account.",
    savedLine: "Your answers, the roles you heart and your reads save to your account. Your résumé never does.",
    forget: "Forget what you saved",
    forgetLine: "Deletes your answers, your hearts and your saved reads from your account. This browser keeps its own copy.",
    forgetting: "Forgetting…",
    forgotten: "Forgotten. Nothing of yours is on our side now.",
    forgetFailed: "That did not go through. Try again in a moment.",
    // the hearts (step 5, 2026-11-05): the roles the person saved, listed here with their hearts
    savedRoles: "Roles you saved",
    noSaved: "None yet. The heart on a role keeps it here.",
    resumeLine: "{words} words, read in your browser and once by our AI reader",
    // the same line when the AI reader did not answer (no key on the host, a time-out): the browser read alone
    resumeLineLocal: "{words} words, read in your browser",
    replace: "replace",
    closest: "Your closest matches",
    noRole: "No role yet",
    noResume: "No résumé yet.", addOne: "Add one", addOneAfter: "and we point you to the fields it fits.",
    fitFields: "Fields that fit you, and why",
    noFitFields: "Pick a field or add a résumé and they appear here.",
    roleSearch: "Open the role you want",
    rolePlaceholder: "Type a role: FP&A, product manager, consultant…",
    roleAria: "Find a role",
    roleGo: "Open →",
    closestHint: "Closest to your résumé: {roles}",
    roleHint: "{roles} roles in {fields} fields. Add a résumé and the three closest appear here.",
    noSuchRole: "No role by that name. Try a word of it, or pick from the list.",
    games: "What you know, from the games",
    gamesLead: "What the games recorded in this browser, role by role. The asks you got right, the ladders you sorted, the postings you read, the demand pairs you saw.",
    asksKnown: "{n} of {m} asks known", ladderSorted: "{n} level ladder sorted", laddersSorted: "{n} level ladders sorted", postingRead: "{n} posting read", postingsRead: "{n} postings read", pairSeen: "{n} demand pair seen", pairsSeen: "{n} demand pairs seen", played: "played",
    exploreFields: "Explore your fields →",
    startOver: "Start over",
    // Start over asks once before it forgets anything
    startOverAsk: "Start over? This forgets your answers and your résumé on this device.",
    startOverYes: "Start over", startOverKeep: "Keep",
    // why a field fits: the reason beside it
    why: { picked: "You picked it", held: "You held {role}", close: "Your résumé reads close to {role}" },
    // the profile strip on Explore
    strip: { chosen: "chosen", fromResume: "from your résumé", noField: "no field from your résumé yet", noResume: "no résumé yet" },
    // About you drawn inside another screen (app.js youInline: home, Networking) and its one-line summary once answered
    inline: {
      heading: "About you",
      lead: "Three quick questions and an optional résumé. The screens use your answers to pick what comes first.",
      done: "Done",
      skip: "Skip for now",
      // over the bar (app.js You.steps): the bar has one step per question and one for the résumé, and so does the count
      step: "Step {i} of {n}",
      lastStep: "Step {n} of {n}: your résumé, optional",
      summaryAria: "What you told us",
      noWhere: "program not answered", noStage: "stage not answered", noFields: "no fields picked",
      resumeOn: "{name} on file", noResume: "no résumé on file",
    },
  };

  // ---------- Explore (#/explore) and a field (#/field/<id>) ----------
  const explore = {
    saved: "Saved:",   // the strip of hearted roles above the fields (step 5, 2026-11-05)
    // "Explore careers" is the launcher (#/skills); this screen has its own name (2026-11-06)
    crumb: "All fields",
    heading: "The fields and their skills",
    counts: "{fields} fields, {roles} roles.",
    pickField: "Pick a field.",
    fitFirst: "The ones that fit you come first.",
    mapLead: "Select a skill to see who asks for it. Point to or tap a field to light the skills that set it apart.",   // the first tap lights, the second opens (2026-11-08)
    countsTip: "Counts are open postings in the US: business fields refreshed {date}{product}.",
    countsTipProduct: ", Product scraped {date} ({n} worldwide)",
    findSkill: "Find a skill",
    viewAria: "View", gridView: "Fields as cards", mapView: "Skill map",   // the names of the ▦ and ⊞ buttons
    key: { have: "Already on your résumé", todo: "Gaps these roles require", quiet: "Other skills: select a dot to see its name", top: "The 35 skills most postings ask for", rest: "The rest: select a dot to see its name", you: "Fields your answers and résumé point to" },
    fieldsAlone: "Show the fields alone", allSkills: "Show all skills",
    example: "e.g. {names}", moreRole: ", +{n} more role", moreRoles: ", +{n} more roles",
    loading: "loading…",
    // the skill map's card (web/skillmap.js): the mean share over the roles the map shows, the count Explore says
    card: { share: "{share} of a role's postings ask for it, on average over the {n} business and product roles." },
    // a field
    field: {
      roles: "{n} roles", role: "1 role",
      openPostings: "{n} open postings",
      biggestFirst: "The biggest first.",
      green: "Green: a rough read of your résumé; open a role for your band of fit.",
      map: "See {field} on the skill map →",
      hover: "Select a skill in the chart to see what it means. Point to or tap a role to light its skills in the chart.",
      axis: "% of {field} postings that ask for the skill",
      axisMeasure: "The share of {field} postings that ask for the skill, averaged over the field's roles. {postings}",
      recent: "The count takes recent postings, open and closed over the last year.", open: "The count takes open postings.",
      have: "already on your résumé", todo: "gaps these roles require",
      held: "you held this role", close: "your résumé reads close to it",
      standsOut: "Stands out for {names}", asksMost: "Asks most for {names}",
      when: "Open postings in the US{refreshed}{world}.", refreshed: ", refreshed {date}", scraped: ", scraped {date}", world: "; {n} worldwide",
      // the chart's lanes (web/skillmap.js chart(); which skills: Atlas.fieldChart)
      lanes: { craft: "{field} craft", people: "Working with people", every: "Asked in every field", todo: "Gaps these roles require", have: "Already on your résumé", loading: "Loading this field…" },
    },
  };

  // ---------- a role (#/role/<id>): the page, the skill list, the cards, the rail ----------
  const role = {
    // the facts under the title
    openUS: "{n} open postings in the US",
    openUSMeasure: "{n} open postings in the US; {world} worldwide, and the skills below read all of them.",
    open: "{n} open postings",
    openMeasure: "{n} open now{closed}.",
    closedMeasure: "; the shares also count {n} postings that closed this year. The skills reflect a year of hiring, not one week",
    employer: "{n} employer", employers: "{n} employers",
    // the lead sentence the data builds
    fewMatch: "Few postings match this view; widen the filters to see what the role asks for.",
    apartOne: "{names} sets this role apart", apart: "{names} set this role apart", leadAsks: "{names} lead the asks", tool: "{names} is the tool", tools: "{names} are the tools",
    // the level control and the filters
    levelAria: "Level", allLevels: "All levels",
    sponsors: "Says it sponsors",
    sponsorsMeasure: "Postings that say they sponsor a visa; most postings say nothing either way. {n} of the {m} in this view say so{no}.",
    sponsorsNo: "; {n} say they do not",
    filters: "Filters",
    removeFilter: "Remove filter {name}",
    grads: "Graduates and interns", remote: "Remote",
    drawer: { employers: "Employers", who: "Who it is for", industry: "Industry", allIndustries: "All industries", employer: "Employer", employerName: "Employer name", typeName: "Type a name to pick an employer.", location: "Location", countryOnly: "{country} only.", anywhere: "Anywhere" },
    // the skills by area
    listHeading: "What the postings ask for",
    listTip: "Skills sit by area, ranked by how many postings in this view ask for them. Open a skill to see what it means, what it breaks down into and how postings say it.",
    inView: "{n} postings in this view", oneInView: "1 posting in this view",
    // what the list's number counts beside the facts' open US count (2026-11-06): the product set reads the world,
    // the business set a year of postings, open and closed
    inViewWorld: "{n} open postings in this view, worldwide", inViewYear: "{n} postings in this view, open and closed this year",
    expandAll: "Expand all", collapseAll: "Collapse all",
    // the "How you work" row's summary: its three most-asked ways of working
    ways: "Shown through the work above. Most asked: {list}",
    // the way into the game for a visitor with no game record yet (2026-11-06)
    tryGame: "Test yourself: {title} ({minutes} min) →",
    noMatch: "No postings match these filters.",
    tiers: ["Most postings ask for these", "A quarter to a half of postings ask for these", "One in ten to one in four postings ask for these"],
    showFewer: "Show fewer", showMoreFewer: "Show {n} more that fewer postings ask for",
    skill: "{n} skill", skills: "{n} skills",
    defining: "◆ sets this role apart: this role's postings ask for it far more often than other roles' postings do.",
    grows: "↗ asked more higher up: leadership postings ask for it at least 1.5 times as often as entry-level ones.",
    known: "✓ you know this one: you got it right in a game.",
    through: "through {names}", inField: "(in this field)",
    barMeasure: "The bar is the share of postings that ask for this skill. {share} of the {n} postings in this view ask for {name}.",
    // a share in words, from nearly every posting down to fewer than one in eight
    shareWords: { nearlyAll: "nearly every posting", twoThirds: "about 2 in 3 postings", half: "about half of postings", third: "about 1 in 3 postings", quarter: "about 1 in 4 postings", seventh: "about 1 in 7 postings", few: "fewer than 1 in 8 postings" },
    // the Also asked for tab
    credAsk: "{words} ask for {name}", credAskOne: "{words} asks for {name}", credMore: "; {names} also come up",
    industries: "Industries named most: {names}. One is enough.",
    credentials: "Degrees and credentials", industriesHeading: "Industries",
    credMeasure: "{share} of the {n} postings in this view ask for {name}.",
    tabs: { skills: "Skills", postings: "Open postings", also: "Also asked for" },
    // the postings tab
    searchPostings: "Search by employer or title", searchAria: "Search postings",
    noOpenMatch: "No open postings match.",
    postingsFoot: "{employers}, {postings}{grads}.", gradsFirst: "; employers hiring graduates and interns first",
    openPosting: "{n} open posting", openPostings: "{n} open postings",
    showMoreEmployers: "Show {n} more employers",
    internship: " · internship", forMBA: " · for MBA graduates", forGrads: " · for new graduates",
    // the skill card
    loadingQuote: "Loading an example sentence…", loadingQuotes: "Loading example sentences…", noQuotes: "No example sentences for this skill yet.",
    evGroups: { early: "Entry and mid-level", senior: "Senior", staff: "Lead / principal", lead: "Director and up" },
    ladderKeys: { associate: "Entry", mid: "Mid-level", senior: "Senior", lead: "Lead" },
    noLadder: "No level ladder for this skill yet.",
    otherLadder: "Shown from the {other} ladder; this skill has none yet for {own}.",
    mostlyMeans: "Mostly means",
    subMeasure: "{share} of the postings in this view that ask for {skill} mention this.",
    showMore: "Show {n} more",
    shareLine: "{words} in this view ask for it.", shareLineOne: "{words} in this view asks for it.",
    shareTip: "{share} of the {n} postings in this view ask for {skill}; {all} of postings across {set} do.",
    allMBA: "all MBA roles", allProduct: "all product roles", allTech: "all engineering, design and legal roles",
    consultingHold: "Build steps for consulting roles wait for an agreed source.",
    noBuild: "No build steps for this skill yet.",
    shownThrough: "Shown through", inFieldNamed: "(in {field})",
    forRole: "For {role}", inFieldLabel: "In {field}",
    lineShows: "A line that shows it{where}:", lineForRole: " for {role}", lineInField: " in {field}",
    lineCarries: "A line about {names} carries it:", or: " or ",
    noOpenAsks: "No open posting in this view asks for it.",
    definesRole: "defines this role ◆",
    cardTabs: { postings: "In postings", ladder: "By level", build: "Build it", related: "Related" },
    howSay: "How postings say it", postingsAsk: "Postings that ask for it", atLevel: "At each level", howShow: "How to show it", howBuild: "How to build it", together: "Often asked for together",
    noRelated: "No other skill comes up with it often enough to name.",
    source: "Source: ", inputOnly: " (names the input, not the method)",
    // the posting card
    notInRole: "That posting is not in this role.",
    fortune: "Fortune #{n}", remoteFact: " · remote", yearsAsked: " · asks for {n}+ years",
    who: { intern: "An internship", mba: "A job for MBA graduates", grads: "A job for new graduates" },
    whoGrade: " at this employer's grade; the posting may also take experienced hires",
    openPostingLink: "Open the posting ↗",
    skillAsked: "{n} skill asked for", skillsAsked: "{n} skills asked for",
    specificAsks: "Specific asks in this posting",
    // the rail
    rail: {
      findClasses: "Find classes relevant for this role →",   // the rail's one closing link (2026-11-01)
      checkCourse: "Check a course against these skills →",
      howFit: "How do you fit?",
      inferredLine: "{n} of them inferred from your experience, from lines that do not name them.", inferredSee: "See the lines",
      dropLead: "Drop your résumé and this panel reads it against these postings. Its text goes once to our AI reader, and we do not store it. Nothing else leaves your browser.",
      orAnswer: "Or answer {n} questions", orAnswerAfter: "to start from your program and the fields you like.",
      forYou: "For you",
      yourFit: "Your fit · {name}",
      reading: "Reading your résumé against these postings…",
      smallSample: "Our sample of résumés for this group of roles is too small to set a band of fit.",
      noBands: "This group of roles has no band of fit yet.",
      postingLine: "of the {m} skills", postingLineAfter: "asks for are on your résumé.", thisPosting: "this posting",
      youShow: "You show", ofMost: "of the {m} skills most postings ask for", isGap: "is a gap", areGaps: "are gaps",
      // under that line (2026-11-06): what the count takes and how many skills in all still need evidence
      whatCounts: "That count takes the {m} skills most asked for {where}.", atLevel: "at {level} level", atAll: "at all levels",
      stillMany: "{n} skills in all still need evidence.", stillOne: "1 skill in all still needs evidence.", stillNone: "No skill in all still needs evidence.",
      stillSee: "See them on your fit →",
      fewMatch: "Few postings match this view; widen the filters.",
      industry: "Name an industry you have worked in; these postings are in {names}.",
      ai: "Show one line of AI work: {names}.",
      classesCover: "Classes that cover it:",
      lineShows: "A line that shows it:",
      openSkillHow: "Open the skill for how postings say it.",
      helpBuild: "Help me build this skill →", helpPosition: "Help me improve my positioning →", openSkill: "Open the skill",
      classesHeading: "Classes that cover your gaps",
      readingRoster: "Reading the {term} roster against your gaps…",
      termClasses: "{term} classes →",
      covers: "Covers {names}",
      allClasses: "All {term} classes, sorted by gaps covered and fit →",
      noClass: "No {term} class names one of your gaps in its description.", seeRoster: "See the roster →",
      needsEvidence: "Needs more evidence",
      evidenceOne: "Evidence that one and your résumé reads as “{band}”.", evidenceThree: "Evidence the top three and your résumé reads as “{band}”.",
      nothingMissing: "You show all {m} skills most postings ask for.",
      seeAll: "See all {n} skills on your résumé, matched to this role →", seeAllOne: "See all 1 skill on your résumé, matched to this role →",
      postingsAsking: "Postings asking for it:",
    },
  };

  // ---------- the fit screen (#/role/<id>/fit) ----------
  const fit = {
    crumb: "Your fit",
    eyebrow: "Your fit · {role}",
    addResume: "Add your résumé",
    addLead: "We read it in your browser against what {role} postings ask for. Its text goes once to our AI reader, and we do not store it. Nothing else leaves your browser.",
    backRole: "← Back to the role",
    backTo: "← Back to {role}", backAfter: ", with your fit marked on every skill.",
    // "Get your tree" (step 5, 2026-11-05): the self-serve tree of step 4, offered under the read when the tree is on
    tree: { heading: "See how your skills compare", lead: "Every skill {role} asks for, next to what your résumé shows. Then your path: which skills to evidence better, which to build, and projects that build them.", button: "Compare my skills →" },
    // how the résumé reads, by persona
    persona: {
      experienced: "Your résumé reads as a {level} {field} profile: {roleYears} in the role, {years} of work overall.",
      pivoter: "Your résumé reads as a move into {field} from {from}: {years} of work, none yet under this role's title.", anotherField: "another field",
      newToRole: "Your résumé reads as early-career, new to {field}{intern}{other}.", withIntern: " with an internship in the role", otherWork: ", {years} of other work",
    },
    underYear: "under a year", years: "{n} years",
    bandsTip: "Bands come from 300 sample résumés of people in and outside the role. There is no pass mark. A band says how your résumé reads next to theirs.",
    youShow: "You show {count} skills that most {role} postings ask for.",
    standingAbove: "You held this role above this level ({level}, {years})", standingAt: "You held this role at this level for {years}",
    standingEmployer: ", and we hold {employer}'s own postings",
    presumedOne: "We presume 1 requirement from that; your résumé does not show it.", presumedMany: "We presume {n} requirements from that; your résumé does not show them.",
    noDates: "We found no jobs with dates in this text.",
    noDatesLine: "We count no roles or years. Put each job title and its dates on one line, for example \"Analyst, Acme, 2021 – 2024\".",
    placeholders: "Some dates in this text are placeholders (\"20XX\").", placeholdersLine: "We read those jobs, but we cannot count their years.",
    industry: "Name an industry you have worked in. These postings are in: {names}. One is enough.",
    ai: "Show one line of AI work: {names}.",
    otherWords: "(said in other words)",
    yearsAsked: "{years} experience asked (you: {you})",
    industriesHiring: "Industries hiring for this:", oneEnough: "One industry is enough; the others are context, not gaps.",
    sayIt: "Say it in {field} words ({n})", sayItButton: "Say it in {field} words",
    inFieldMeans: "In {field} this means:", postingsSayLike: "Postings say it like:",
    thin: "Shown, but without specifics ({n})",
    thinLead: "You show these, but not with the specifics or outcomes postings ask about.",
    mention: "Mention:",
    unmapped: "{n} lines we could not read as a skill",
    marks: {
      through: "⤷ shown through {name}. A way of working is never a line of its own; the line about {name} on your résumé shows it.",
      transferable: "⟲ said in other words: your résumé shows this in another field's words. Postings here say it differently; see Details for how.",
      presumed: "◌ presumed: people who hold the role you held do this, so it earns part credit. Your résumé does not show it.",
      thin: "○ named, not shown: listed as a word, but no work, project or course line shows it.",
      inferred: "◈ inferred from your experience: your résumé shows it without naming it. The line that suggested it: “{line}”",
    },
    // the model read (web/infer.js): the skills the resume shows without naming them, on the Details tab
    inferred: "Inferred from your experience ({n})",
    inferredLead: "Our AI reader found these in your lines, though your résumé never names them. Each earns part credit. Name it in your own words for full credit.",
    inferredIndustry: "Industry",
    postingAsks: "This posting asks for it: the text you pasted names {name}.", postingTag: "this posting asks for it",
    barMeasure: "{share} of the postings in this view ask for {name}{most}.", mostOfThem: ", most of them",
    classesCover: "Classes that cover it:",
    showFewer: "Show fewer", more: "+{n} more",
    already: "Already on your résumé", nothingYet: "Nothing yet.",
    needsEvidence: "Needs more evidence", nothingAmong: "Nothing among the skills most postings ask for.",
    // the line under the lead (2026-11-06): the lead counts the most-asked skills, the two lists every skill
    colsNote: "The count above takes only the {m} skills most postings ask for. The two lists hold every skill these postings ask for.",
    checkCourse: "Check a course against these skills →",
    credentials: "Credentials and industries", noneAsked: "None asked for in this view.",
    tabs: { show: "Skills", details: "Details" },
    allLevels: "All levels",
    // the pasted posting
    postingLine: "{name}: this posting asks for {m} skills of this role; {n} are on your résumé. Those come first below, marked.",
    postingLineOne: "{name}: this posting asks for 1 skill of this role; {n} are on your résumé. Those come first below, marked.",
    pasteAnother: "Paste another", forgetPosting: "Forget it",
    havePosting: "Have a posting? Paste it.",
    postingLead: "We read it in your browser, like a syllabus. The skills it names come first in the lists below, with your résumé's status for each. The band stays the role's. Nothing leaves your browser.",
    readPosting: "Read the posting →",
    dropPosting: "Drop the posting (PDF, DOCX or TXT)",
    pastePosting: "Or paste the posting's text:", postingAria: "Posting text",
    postingPlaceholder: "Senior Financial Analyst, FP&A. You will own the monthly forecast, build driver-based models…",
    // check a course (#/role/<id>/course)
    course: {
      crumb: "Check a course",
      eyebrow: "Check a course · {role}",
      heading: "Check a course",
      lead: "Drop a syllabus or paste the course description. We read it in your browser against the skills {role} postings ask for.",
      drop: "Drop a syllabus (PDF, DOCX or TXT)",
      read: "Read: {name}.",
      paste: "Or paste the course description, the list of topics or the week-by-week plan:", aria: "Course text",
      placeholder: "FIN 620 Corporate Financial Planning. Topics: budgeting cycles, rolling forecasts, variance analysis…",
      button: "Read the course →",
      teaches: "This course teaches",
      coreLine: "{n} of the {m} skills that most {role} postings ask for and a course can show.",
      // the level the count reads, with a control; with no such skill at that level the count takes all levels
      level: "Level",
      coreNone: "At {level} level, a course can show none of the skills most postings ask for. So this count takes all levels.",
      coversOne: "It covers one of your gaps: {names}.", coversMany: "It covers {n} of your gaps: {names}.", coversNone: "It covers none of your gaps for this role.",
      checkFit: "Check your fit", checkFitAfter: "to see which of your gaps it covers.",
      shareNote: "The share is how many postings ask for the skill.",
      noSkill: "The text names no skill a course can show for this role.",
      named: "Named, but a course cannot show these",
      namedNote: "A course shows craft. How you work shows through your work, on",
      yourFit: "your fit",
      notCover: "It does not cover",
      notCoverNote: "Craft most postings ask for that the text does not name. A course can teach a skill without naming it the way postings do. Open a skill to see how postings say it.",
      onList: "On the skills list",
      onListNote: "Green: the course names it. Amber: most postings ask for it and the course does not name it. Ways of working stay unpainted: a course cannot show them.",
      noneFound: "We found none of this role's skills in that text.",
      tooShort: "The text is very short; paste the topics or the week-by-week plan.",
      checkText: "Paste the list of topics, or check that the text is a course description.",
    },
    // prepare for an event (#/field/<id>/event)
    event: {
      crumb: "Prepare for an event",
      heading: "Prepare for an event",
      lead: "{field} · which kind of event?",
      kinds: { networking: "Networking event", roundtable: "Employer roundtable", hackathon: "Hackathon or case competition" },
      kindLines: { networking: "Which roles will be in the room and what to ask them.", roundtable: "Which of your experiences to bring up, role by role.", hackathon: "What to build so it shows a skill these roles ask for." },
      inRoom: "Who will be in the room",
      inRoomLead: "The {field} roles, by open postings now, with the one or two skills that set each apart. Ask about those.",
      askAbout: "Ask about: {names}", askWeek: "what a week looks like",
      sayAbout: "What to say about yourself",
      addResume: "Add your résumé",
      addResumeSay: "and we list the three skills you show that most of these roles ask for.",
      employers: "Employers hiring for these roles now",
      loadingPostings: "Loading the postings of this field…",
      yourLines: "Your lines for the room",
      readingRoles: "Reading your résumé against these roles…",
      roleByRole: "Role by role",
      roleByRoleLead: "What to lead with for each role, and what they may ask about that your résumé does not show.",
      roleByRoleNoResume: "and we match your lines to each role. Without it, here is what most postings of each role ask for.",
      mostAsk: "Most postings ask for {names}", mostAskList: "Most postings ask for: {names}.",
      openRole: "Open the role →",
      build: "What to build",
      buildLead: "Skills most of these roles ask for that your résumé does not show yet. A project that shows one is worth a line on your résumé.",
      buildNoResume: "Skills most of these roles ask for.", buildNoResumeAfter: "and we leave out the ones you already show.",
      askedByOne: "Most postings of one role here ask for it.", askedByMany: "Most postings of {n} roles here ask for it.",
      noStep: "No build step for this skill yet; open it on a role screen to see how postings say it.",
      nothingLeft: "Nothing left: your résumé shows what these roles ask for.",
      industryKnown: "the industry you know", aiWork: "AI in your work",
      fits: "Fits {n} of {m} roles.", sayLike: "Say it like:",
      roleMeasure: "{share} of {role} postings ask for it.",
      noLines: "Your résumé shows none of the skills most of these roles ask for yet. Open a role and check your fit to see what to evidence.",
      leadWith: "Lead with {names}", nothingLead: "Nothing to lead with yet", mayAsk: " · they may ask about {names}",
      showsNone: "Your résumé shows none of the skills most of these postings ask for.",
      mayAskList: "They may ask about: {names}.",
      readFailed: "Could not read your résumé against these roles.",
      fewer: "Fewer", allN: "All {n}",
      loadFailed: "Could not load the postings.",
      fromResume: "From your résumé: the skills you show that most of these roles ask for. Lead with these.",
      noSkillYet: "Your résumé does not yet show a skill that most of these roles ask for. Open a role and check your fit to see what to evidence.",
    },
  };

  // ---------- Find jobs (#/jobs), v19 B4 ----------
  const jobs = {
    heading: "Find jobs",
    loading: "Loading postings…",
    loadFailed: "The postings did not load. Reload the page to try again.",
    lead: "Search {n} open US postings at {m} companies.",
    searchPlaceholder: "Search a title, company or skill", searchAria: "Search",
    locPlaceholder: "City, state or remote", locAria: "Location",
    search: "Search",
    postingsAria: "Postings",
    // on a phone the filters come after the postings; this link over the list goes to them
    filtersLink: "Filters ↓", filtersAria: "Filters",
    noteResume: "Each posting counts the skills it asks for that your résumé shows. Fit puts the postings where you show the largest part of those skills first. Change your résumé in", noteResumeLink: "About you",
    noteNoResume: "Add your résumé", noteNoResumeAfter: "and each posting says how many of its skills you show.",
    sort: "Sort",
    sorts: { fit: "Fit", best: "Best match", newest: "Newest", company: "Company A–Z" },
    // the date on the card and the panel: the board's own posting date, else the day our scrape first saw the posting,
    // which is never called a posting date (it clusters on the days we scrape)
    posted: "Posted {date}", listed: "Listed here {date}",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    // the four level words on the rail and the card, the entry marks, the employer types
    levels: { associate: "Analyst or associate", mid: "Manager", staff: "Lead or principal", director: "Director" },
    // the same four words for the tech set's cards, and for the rail while a tech field is picked: an engineer at the
    // second grade is not a manager
    levelsTech: { associate: "New grad or junior", mid: "Mid-level or senior", staff: "Staff or principal", director: "Director" },
    // the Entry facet: new graduates holds every set's mark, and the last value names the year after the data's own
    entries: { grads: "New graduates", mba: "MBA entry", intern: "Internship", later: "Starts {year} or later" },
    // the years filter: the most a posting may ask for; a posting that names no number always counts
    years: { "2": "Up to 2 years", "5": "Up to 5 years", "8": "Up to 8 years" },
    yearsNote: "Postings that name no number of years count too.",
    yearsFact: "asks for {n}+ years", clearanceFact: "asks for a security clearance",
    employers: { fortune500: "Fortune 500", startup: "Startup", mba_employer: "MBA employer" },
    groupStartup: "Startup", groupMBA: "MBA employer", groupFortune: "Fortune {n}",
    who: { intern: "An internship", mba: "A job for MBA graduates", grads: "A job for new graduates", mba_start: "A job for MBA graduates, starting {year}", grads_start: "A job for new graduates, starting {year}" },
    fitLine: "{n} of the {m} skills this posting asks for are on your résumé.",
    // the card's facts line names a field on every card; a role the data puts in no field gets this word
    noField: "Other field",
    moreSkills: "+{n} more",
    remote: "remote", sponsorsVisa: "says it sponsors a visa", noSponsorVisa: "says it does not sponsor a visa",
    addResume: "Add your résumé", addResumeAfter: "and this line counts the skills you show.",
    openAt: "Open the posting at {company} ↗",
    skillAsks: "1 skill this posting asks for", skillsAsk: "{n} skills this posting asks for",
    dupeOne: "1 more posting", dupes: "{n} more postings", dupeAfter: "with this title at {company}{where}. We show it once.", dupeWhere: " in {location}",
    // the rail
    dead: "No posting matches this with the other filters on",
    facets: { field: "Field", role: "Role", level: "Level", entry: "Entry", years: "Years of experience", sector: "Industry", group: "Employer type", sponsor: "Visa sponsorship", company: "Company", work: "Work" },
    remoteFacet: "Remote", noclearFacet: "No security clearance",
    // the sponsorship facet's two values, and the chip over the list for each: "open" keeps every posting that does
    // not say it will not sponsor
    sponsor: { yes: "Says it sponsors", open: "Doesn't rule it out" },
    sponsorChip: { yes: "Says it sponsors a visa", open: "Doesn't rule out a visa" },
    // the quick filters under the search box: the same filters as their rows on the rail
    quickAria: "Quick filters", quick: { sponsor: "Says it sponsors a visa", grads: "New graduates", remote: "Remote" },
    more: "more…",
    // the empty state and the count
    quoted: "“{q}”", inLoc: "in {loc}",
    // over the list when no posting has every word of the search and the list holds those that miss one
    relaxed: "No posting has every word you searched. These match all but one.",
    // over the list when the search names a filter: one sentence a filter, its name a button that turns it on and takes
    // those words out of the search
    hint: "Looking for {what}? Turn on the {filter} filter.",
    hintWhat: { grads: "jobs for new graduates", intern: "internships", later: "jobs that start in {year} or later", remote: "remote jobs", sponsor: "jobs that sponsor a visa" },
    empty: "No posting matches all of this.", removeOne: "Remove one:", remove: "Remove {label}",
    showing: "Showing {from}–{to} of {total} postings", posting: "1 posting", postings: "{n} postings",
    // beside the count (2026-11-06): the lead counts every posting, the list shows a repeated title at one employer once
    folded: "{n} repeats shown once", foldedOne: "1 repeat shown once",
    clearFilters: "Clear filters",
    previous: "Previous {n}", pageOf: "Page {p} of {n}", next: "Next {n}",
  };

  // ---------- Explore careers (#/skills), the launcher, v19 B5 (named "Explore roles & build skills" until 2026-11-01) ----------
  const skills = {
    heading: "Explore careers",
    lead: "Pick a role from {roles} in {fields} fields. Add your résumé to see how your skills match up.",
    search: "Search roles, for example product manager",
    searchLabel: "Search roles",
    pickField: "Pick a field, then a role.",
    hits: "{n} roles match. Pick one to see what its postings ask for.",
    hit: "1 role matches. Pick one to see what its postings ask for.",
    noHit: "No role matches. Try fewer letters, or pick a field below.",
    tile: "{roles} roles · {open} open",
    tileOne: "1 role · {open} open",
    fieldLine: "{roles} roles · {open} open postings. Pick one to see what its postings ask for.",
    fieldLineOne: "1 role · {open} open postings. Open it to see what its postings ask for.",
    backToFields: "← Back to fields",
    mapLink: "See all fields on a skill map →",
    asks: "Most postings ask for: {asks}.",
    open: "{open} open",
    rolesAria: "Roles",
    resume: {
      heading: "Your résumé",
      privacy: "We read it in your browser against what each role's postings ask for. Its text goes once to our AI reader, and we do not store it.",
      onFile: "read in your browser and once by our AI reader",
      onFileLocal: "read in your browser",   // when the AI reader did not answer
      inferred: "{n} of them inferred from your experience; your fit shows the lines that suggested them.",
      change: "change",
      band: "{band} for {role}.",
      line: "{n} of the {m} skills most {role} postings ask for {are} on your résumé.", is: "is", are: "are",
      fit: "See your fit for {role} →",
      closest: "Closest roles",
      ranked: "Ranked by how many of their top skills you show.",
      failed: "Could not read it against the roles. Reload the page to try again.",
      reading: "Reading it against the closest roles…",
      noClose: "No role reads close to it yet. Pick a role on the left and open your fit there.",
    },
    you: "more about you →",
  };

  // ---------- Networking (#/network): Who to meet, v19 B5 ----------
  const network = {
    crumb: "Networking",
    eyebrow: "Networking · {role}",
    heading: "Who to meet",
    // the gate: with no answers, no résumé and no role, the About you questions come first, on this screen
    gateLead: "Answer a few questions first. They pick the role to plan your chats for.",
    role: "Role",
    rolePlaceholder: "Type a role",
    // the Role box when nothing matches (usability pass 2026-11-06): the closest roles, the fields, what comes later
    roleNoMatch: "No role has that name.", roleClosest: "These roles come closest:",
    roleFields: "The list has business and product roles in these fields: {fields}.",
    roleLater: "Engineering, design and legal roles come later.",
    who: "Who to look for",
    moreJobs: "See more companies in Find jobs →",
    where: "Where to find them",
    noWhere: "No place to look in the data for this type.",
    prep: "Prep a chat",
    company: "Company",
    companyPlaceholder: "Type a company",
    professor: "Professor",
    professorPlaceholder: "Type a name",
    openHint: "{n} open",
    coversHint: "covers {n} of your gaps",
    noTitle: "Title not on the roster",
    sideAria: "Prep a chat",
    typesAria: "The person to meet",   // the type tabs' tablist (usability pass 2026-11-06)
    gapsOf: "{n} of {m} gaps", covers: " · covers {names}",
    teachesOf: "teaches {n} of the {m} skills this role's postings ask for most", teachesNames: " · teaches {names}",   // with no résumé: the role's core asks its classes teach
    moreProfs: "{n} more in the Professor list of the prep card.",
    rosterFailed: "The roster did not load. Reload the page to try again.",
    // the school's name in the alumni links, by the door's campus flag (app.js Door.campus)
    schools: { cornell: "Cornell", ienyc: "IE" },
    // the people types; the alum shows for an address with a campus flag, faculty only when that flag's roster is loaded
    types: {
      hm: { label: "A hiring manager" },
      inrole: { label: "Someone in the role now" },
      recruiter: { label: "A recruiter" },
      alum: { label: "An alum in the role" },
      faculty: { label: "Faculty on campus" },
    },
    // "Who to look for" has no lead (owner's feedback 2026-11-01: the list speaks for itself); this line stands in for
    // the hiring manager's titles when no senior posting is open
    whoLines: {
      hmNone: "No senior {role} posting is open now. Look one level up: {next}.",
    },
    // where to find them: the link labels only (owner's feedback 2026-11-01: a link is a link, no line on what it opens)
    whereLines: {
      handshake: "Handshake",
      leads: "{company} · {role} leads", recruiters: "{company} · recruiters",
      alumni: "{role} · {school} alumni", alumniAt: "{company} · {role} · {school} alumni",
      alumniAny: "{role} · alumni", alumniAtAny: "{company} · {role} · alumni",   // a flag with no school name
    },
    // the prep card's suggested approach: talking points to paste into an AI helper or keep as notes. The slots come from
    // the data (network.js say()): {skill} is a craft skill, never a behaviour, a generic skill or a credential.
    approach: {
      heading: "Suggested approach",
      note: "Talking points to paste into your AI helper or keep as notes.",
      leadWith: "Lead with", ask: "The ask", questions: "Three questions",
      copy: "Copy", copied: "Copied.", copyFailed: "Select the text and copy it.",
      addResume: "Add your résumé", addResumeAfter: "to name the skills you show.",
      theClass: "the class", theSkills: "the skills most postings ask for",
      shows: "Your résumé shows {skills}. Most {role} postings ask for them.",
      showsOne: "Your résumé shows {skills}. Most {role} postings ask for it.",
      atCompany: "{company} asks for {skill} in {k} of its {n} {role} postings.",
      showsNone: "Your résumé does not show the top {role} asks yet. Lead with the work closest to {skill}.",
      noResume: "Lead with the work you have done closest to {skills}.",
      sub: ", {sub} in particular",
      asks: {
        hm: "Could I have 20 minutes to hear what you look for in {aRole} hire?",
        hmAt: "Could I have 20 minutes to hear what {company} looks for in {aRole} hire?",
        inrole: "Could I have 20 minutes to hear what a week in your role looks like?",
        recruiter: "Could I have 15 minutes to hear how {company} hires for {role} roles?",
        recruiterNoCo: "Could I have 15 minutes to hear how your team hires for {role} roles?",
        alum: "Could I have 20 minutes to hear how you got from your school to {role}?",
        faculty: "Could I have 15 minutes to ask whether {code} covers {skill}?",
      },
      // three question shapes per type; network.js picks the first whose data is there and fits in 20 words
      q: {
        hm: {
          quote: "Your {title} posting says “{quote}”. What does that look like in a first year?",
          posting: "Your {title} posting asks for {skill}{sub}. How does that show up in a first year?",
          role: "Most {role} postings ask for {skill}. How does that show up in a first year on your team?",
          bridge: "My résumé shows {lead}; your {role} postings stress {skill}. What does strong work in {skill} look like on your team?",
          stress: "Your {role} postings stress {skill}. What does strong work in {skill} look like on your team?",
          stressRole: "Many {role} postings ask for {skill}. What does strong work in {skill} look like on your team?",
          learn: "I am still building {skill}. Which of your {n} open {role} roles would let me learn it on the job?",
          learnRole: "I am still building {skill}. Where would a new {role} on your team learn it?",
          teach: "Which of your {n} open {role} roles would teach {skill} on the job?",
        },
        inrole: {
          stress: "{company}'s {role} postings ask for {skill} more than most. What did that look like in your first year?",
          asks: "{company}'s {role} postings ask for {skill}. What did that look like in your first year?",
          askRole: "Most {role} postings ask for {skill}. What does that look like in your week?",
          gap: "My résumé does not show {skill} yet. How did you build it before you joined {company}?",
          gapRole: "My résumé does not show {skill} yet. How did you build it before your first {role} job?",
          built: "How did you build {skill} before you joined {company}?",
          builtRole: "How did you build {skill} before your first {role} job?",
          sub: "Your team's postings name {sub} under {skill}. How does your team do it day to day?",
          title: "{company} posts {title} roles now. What would someone in that seat work on first?",
          week: "Where does {skill} come up in your week, and who asks for it?",
        },
        recruiter: {
          count: "{company} has {n} open {role} postings. Which teams take new grads first?",
          countRole: "Which teams take new grads first for {role} roles?",
          level: "Of those, {k} sit at the {level} level. What gets a résumé past your first screen there?",
          levelOne: "Of those, one sits at the {level} level. What gets a résumé past your first screen there?",
          levelAll: "They all sit at the {level} level. What gets a résumé past your first screen there?",
          levelRole: "At which level do new grads join for {role} roles?",
          screen: "Your postings ask for {skill}. How do you screen for it when a new grad has not held the title?",
          screenRole: "Most {role} postings ask for {skill}. How do you screen for it in a new grad?",
        },
        alum: {
          learned: "Which class or project helped you most with {skill} on the way to {role}?",
          titles: "{company} posts {title} and {title2} now. Which would you aim at first, and why?",
          titleOne: "{company} posts {title} now. Would you start there, or one level below?",
          levelRole: "Most open {role} postings sit at the {level} level. Is that where you started?",
          startRole: "Which {role} title did you start in, and would you start there again?",
          choose: "My résumé shows {lead} but not {skill} yet. Which would you build first to get hired at {company}?",
          chooseRole: "My résumé shows {lead} but not {skill} yet. Which would you build first to get hired as {aRole}?",
          chooseNoLead: "Which would you build first to get hired at {company}: {skill} or {skill2}?",
          chooseRoleNoLead: "Which would you build first to get hired as {aRole}: {skill} or {skill2}?",
          // the shorter asks when long skill or company names take a question over 20 words
          chooseNoLeadShort: "Which would {company} want first: {skill} or {skill2}?",
          chooseShort: "Which would you build first: {skill} or {skill2}?",
        },
        faculty: {
          covers: "{role} postings ask for {skill}{sub}. How much of that does {code} cover?",
          project: "Which project in {code} could show {skill} to {aRole} hiring manager?",
          other: "Does {code} touch {skill} too, or which class this term does?",
        },
      },
    },
  };

  // ---------- the class picker (#/classes) and the professor card (#/professor/<slug>) ----------
  const classes = {
    crumb: "Classes",
    heading: "Pick your classes",
    noCampus: "This page names no campus.",
    whichCampus: "Which campus are you at?",
    rosterLink: "{term} roster →", rosterNotLoaded: "Roster not loaded yet",
    campusStays: "Your campus stays in this browser; change it any time from the classes screen.",
    changeCampus: "change campus",
    rosterClosed: "The roster has not loaded yet.",
    rosterFailed: "We could not read the roster: {message}.",
    rosterEmpty: "The roster is empty right now. Check back after the next refresh.",
    matchRoles: "Match to roles", addRole: "Add a role", pickRole: "Pick a role", addRoleAria: "Add a role", removeRole: "Remove {role}",
    // the lead under the heading while no role is chosen, and the line in place of the résumé row once a résumé is read
    pickRoleLead: "Pick a role first. Each class then shows how well it fits that role.",
    resumeNoRole: "Résumé read. Pick a role above to see your gaps.",
    // the pre-enrollment dates under the heading, from the campus entry (pre_enrollment.label, roster_updates_until)
    preEnrollment: "Pre-enrollment: {dates}.", rosterUpdates: "The roster can change until {date}.",
    // the collapsible facets under the subject row (owner feedback 2026-11-01); a closed facet names how many it holds
    facets: { days: "Days", credits: "Credits", eligibility: "Who can take it", professor: "Professor" },
    facetOn: "{label} · {n}",
    days: { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" },
    noRestriction: "No restriction", anyProfessor: "Any professor",
    about: "About {name} →", noProfile: "{name} has no profile on the roster yet.",
    coversGap: "Covers a gap",
    sort: "Sort", sorts: { relevance: "Relevance", gaps: "Gaps covered" },
    addResume: "Add your résumé and each card says which of your gaps it covers.",
    gapLine: "Your fit for {roles} leaves {gaps}. Each card says which it covers, read from the course text by kind. A course can show craft, not how you work.",
    gap: "1 gap", gaps: "{n} gaps",
    // the gaps by name under the gap line: the first few, then "and N more" (Catalog.namesLine)
    gapNames: "Your gaps: {names}.", andMore: "{names} and {n} more",
    noGaps: "Your résumé shows every skill most {roles} postings ask for; nothing to cover.",
    searchPlaceholder: "Code, title or content", searchAria: "Search by code, title, description or outcomes",
    subject: "Subject", all: "All",
    noMatch: "No class matches.",
    // an empty list names the filters that emptied it (Catalog.activeFilters), and a button clears them all
    noMatchBy: "No class matches {filters}.", clearFilters: "Clear filters",
    filterSearch: "the search “{q}”", filterSubject: "the subject {subject}", filterNamed: "the {name} filter",
    // the class card (Catalog.cardHtml)
    credit: "{n} credit", noInstructor: "Instructor not named yet", reading: "reading…", fromDescription: "from the course description",
    why: "Why", whyNote: "Read from the roster text; a course can teach a skill without naming it.",
    noneNamed: "The course text names none of the role's main skills.", matchIn: "in {field}",
    coverSome: "Covers {n} of your {total} gaps: {names}", coverNone: "Covers none of your {total} gaps",
    noCoverLine: "No class names your gaps. These are the closest.",
    // the detail panel
    description: "Description", outcomes: "Outcomes", prerequisites: "Prerequisites", limitedTo: "Enrollment limited to",
    sections: "Sections", noSection: "No section on the roster yet.",
    grading: "Grading", teaching: "Teaching it",
    openRoster: "Open on the class roster ↗",
    credits: "{n} credits", noCredits: "credits not listed",
    timeTBA: "time not set yet",
    // the professor card
    professor: "Professor",
    noProfessor: "No professor named.", backClasses: "Back to the classes.",
    rosterClosedHere: "The roster has not loaded here yet.",
    profileFailed: "We could not read the profile: {message}.",
    noProfileNamed: "No profile under that name on the roster.",
    teachingIn: "Teaching in {term}", openInPicker: "open in the picker →", noClassTerm: "No class on the roster this term.",
    noTitle: "Title and affiliation not on record.",
    angle: "Networking angle", more: "More",
    links: { official: "Official profile", site: "Personal site", scholar: "Google Scholar", linkedin: "LinkedIn" },
    yourGaps: "Your gaps",
    profCovers: "{name}'s {classes} this term cover {n} of your {gaps} for {roles}.", profCoversNone: "None of {name}'s {classes} this term names one of your {n} gaps for {roles}.",
    classWord: "class", classesWord: "classes", gapWord: "gap", gapsWord: "gaps",
    byKind: "Read from the course text by kind, as the picker reads it. A course can teach a skill without naming it. Your fit for {links}.",
    // sign-in is off
    signinOff: "Sign-in is off. Everything here is open.", homeLink: "Home →",
    // the home card with no campus known
    neutralDetail: "The roster, who teaches what, and how each class reads against the roles you want.",
    neutralTag: "Pick your campus →",
  };

  // ---------- the sign-in for the apprentice maps (#/signin with CONFIG.MAPS_ENABLED; web/auth.js) ----------
  // An email to an invited address only. It carries a six-digit code and a link (one GoTrue template serves both), so
  // the page takes the code and the link still works (2026-11-11: the email led with a code the page never asked for).
  const signin = {
    crumb: "Sign in",
    heading: "Sign in",
    lead: "Have an invite? Enter the email it came to.",
    // what the map is, on the invited sign-in (2026-11-06): a visitor without an invite reads this first
    mapLine: "Build skills is your private plan: how your skills compare with your roles, and quests that build the rest. It opens by invite today.",
    askInvite: "Ask for an invite",
    email: "Email",
    emailPlaceholder: "The email on the invite",
    button: "Email me a code",
    sending: "Sending…",
    sent: "Check your email for a six-digit code. It works once.",
    sentLink: "The link in the email works too.",
    sentTo: "Sent to {email}.",
    refused: "This email has no invite.",
    failed: "The email did not go out. Check your connection and try again.",   // a network failure alone
    // GoTrue answered, and said no (2026-11-06): too many emails, or another refusal; never the connection line
    rateLimited: "Too many emails sent. Try again in an hour.",
    rateWait: "Too many emails in a short time. Try again in {n} seconds.",
    serviceFailed: "The email service did not send it. Try again in a few minutes.",
    invalid: "Enter the email address on your invite.",
    expired: "That link no longer works. Send yourself a new code.",
    note: "The code signs you in on this browser. Nothing else here needs a sign-in.",
    explore: "Explore careers without one →",
    // the code flow (the visitor journey, step 2, 2026-11-05): anyone, email plus a six-digit code, no password
    codeLead: "Enter your email. We send a six-digit code; no password.",
    codeEmailPlaceholder: "you@school.edu",
    codeButton: "Send me a code",
    codeSent: "We sent a code to {email}. It works once.",
    code: "The code",
    codePlaceholder: "6 digits",
    verify: "Sign in",
    verifying: "Checking…",
    codeWrong: "That code did not work. Check it, or send a new one.",
    codeRefused: "We could not send a code to that address right now. Try again in a minute.",
    another: "Send another code",
    changeEmail: "Another email",
    codeNote: "The code signs you in on this browser. Your résumé stays here; your read and your lists save to your account.",
    done: "Signed in as {email}.",
    signedIn: "Signed in",
    signIn: "Sign in",
    signOut: "Sign out",
    // the first personal act: the résumé read asks for a sign-in (web/app.js resumeForm)
    gateHeading: "Sign in to read your résumé",
    gateLine: "A six-digit code goes to your email. No password.",
    gateButton: "Sign in →",
  };

  // ---------- feedback (step 6, 2026-11-05): the link, the box, the prompt's two leads ----------
  const feedback = {
    link: "Feedback",
    heading: "Tell us one thing",
    lead: "What worked, what did not, what you came for and did not find. One sentence is enough.",
    promptLead: "You have looked around for a while. What should we change?",
    treeLead: "You can see how your skills compare. What do you make of it?",
    placeholder: "One thing you would change…",
    emailLabel: "Your email, if you want a reply (optional)",
    count: "{n} of {max}",
    send: "Send",
    sending: "Sending…",
    notNow: "Not now",
    close: "Close",
    empty: "Write something first.",
    thanks: "Thanks. We read every one.",
    failed: "That did not go through. Try again in a moment.",
    privacy: "We keep what you type here, the screen it came from and your email only if you typed it.",
    // the email box starts empty (owner, decision 4a, 2026-11-06): the address on file is one press away, never sent
    // unasked
    useEmail: "Use {email}",
    badEmail: "Check the email, or leave it empty.",
    // the sheet opened from the sign-in's "Ask for an invite"
    inviteLead: "Ask for an invite to an apprentice map. Say the role you want it for, and add your email so we can reply.",
  };

  // ---------- the heart (step 5, 2026-11-05): one list, on a role's row and on the open role ----------
  const heart = {
    save: "Save role",
    saved: "Saved",
    saveAria: "Save {role}",
    unsaveAria: "Remove {role} from your saved roles",
    // the open role's Save: the name starts with the words on the button, so a speech user can say them (2026-11-06)
    saveRoleAria: "Save role: {role}",
    savedRoleAria: "Saved: {role}",
    kept: "Kept in this browser.",
    signIn: "Sign in to keep it on your account.",
  };

  // ---------- the apprentice map (#/map, the Build skills section) and its one line on the launcher (#/skills) ----------
  const map = {
    heading: "Your map",
    roleAt: "{role} at {company}.",
    loading: "Loading your map…",
    failed: "Your map did not load. Reload the page to try again.",
    waiting: "We are writing your map. It opens here when it is ready.",
    only: "Only you can open it.",
    signOut: "Sign out",
    // the self-serve tree (step 4, 2026-11-05): the form on #/map for a signed-in person with no map, and the line
    // under a map the site built
    tree: {
      // Build skills' first step, for a person with no map yet (2026-11-10): what comes after the form
      firstHeading: "Build skills",
      firstLead: "Start with your résumé and the roles you want. We then show how your skills compare with what those roles ask for, and quests that build the rest.",
      heading: "Compare your skills",
      lead: "We read your résumé against each role you pick: what it asks for and how your résumé reads for it. Then quests that build the rest. Two lines of your own come first.",
      resume: "Your résumé",
      onFile: "{name} is on file.",
      change: "Use another",
      noResume: "Add your résumé first.",
      field: "The field",
      pickField: "Pick a field",
      role: "The role you aim at first",
      pickRole: "Pick a role",
      also: "Other roles of the field, up to three",
      posting: "A posting you have in mind (optional)",
      postingHint: "Paste its text. The skills it names come first on your cards.",
      build: "Compare my skills",
      building: "Comparing your skills…",
      built: "Your comparison is ready. Your quests are next.",
      byHand: "Your map came from us, by hand. It stays as it is.",
      signedOut: "Your sign-in ended. Sign in again, then build.",
      failed: "The build did not go through. Try again in a minute.",
      self: "Compared with your résumé on {date}.",
      again: "Compare again",
    },
    // the open tree (2026-11-11, behind CONFIG.OPEN_TREE_ENABLED): the form for a visitor with no session, the line
    // under their tree, the two projects (web/preview.js: a title and a line each, never a plan or a length of time)
    // and the booking card (drawn only when CONFIG.BOOKING_TALLY holds a form id). The price is the owner's.
    // Since 2026-11-12 the form asks one question per screen (#/map/find/<step>, app.js openForm): it finds projects
    // for a portfolio, and the skill tree is what they come from. Steps c to e reuse flow.tech, flow.tools and
    // flow.accounts; the rest is here.
    open: {
      heading: "Find projects for your portfolio",
      lead: "A few questions, one per screen. We pick projects from what your target roles ask for and what your résumé shows.",
      roles: {
        title: "Which roles are you aiming at?",
        lead: "Pick one to four roles of one field. Your projects aim at the first one.",
        browse: "Or browse by field",
        browseAria: "Fields",
        fieldRoles: "Roles in {field}",
        noRole: "Pick a role to go on.",
      },
      resume: {
        title: "Your résumé",
        lead: "Your projects build on what it already shows.",
        posting: "Add a posting you have in mind (optional)",
        noResume: "Add your résumé to go on.",
      },
      noTech: "Pick the one closest to you to go on.",
      last: {
        title: "Last, your email",
        goThere: "Go to that step",
      },
      email: "Your email",
      emailHint: "you@school.edu",
      badEmail: "Enter your email to go on.",
      keeps: "Your email reaches us. Your skills and projects stay in this browser.",
      // with the build quests on (CONFIG.OPEN_QUESTS_ENABLED; web/api/open.js): the résumé goes once to the model
      keepsQuests: "Your email reaches us. Our AI reads your résumé once to write your projects. We keep neither. Your projects stay in this browser.",
      find: "Find my projects",
      finding: "Finding your projects…",
      failed: "We could not find your projects just now. Try again in a minute.",
      questsHeading: "Your projects",
      questsLead: "Written for your résumé and these roles. Open one to see its steps.",
      writing: "Writing your projects from your résumé and your roles. Keep this page open while we write.",
      questsLimited: "We reached today's limit on new projects. Come back tomorrow for yours.",
      questsFailed: "We could not write your projects just now.",
      retry: "Try again",
      kept: "This comparison lives in this browser only.", keptQuests: "Your projects and this comparison live in this browser only.",
      postingHint: "Paste its text. Your projects lean toward the skills it names.",
      forget: "Forget it",
      previewHeading: "Two projects you could build",
      previewOne: "A project you could build",
      previewLead: "Picked from what {role} hiring asks people to show and the skills you still have to evidence or build. A title and a line each, not a plan.",
      builds: "Builds: {skills}",
      book: {
        heading: "Get a personalized project plan and a 90-minute session to get started",
        line: "A 1:1 session. We pick your project and plan it around your résumé and your roles. Then we start it together. $60.",
        button: "Book a session · $60",
      },
    },
    // the map screen (web/map.js, app.js drawMap), two pages since 2026-11-10: Quests (one quest at a time, the slim
    // path, up next) and Skill tree (the legend bar, the tree or its list, the node panel). No time estimate shows.
    print: "Print",
    questsTitle: "{name}'s quests",
    questsHeading: "Your quests",
    treeTitle: "How {name}'s skills compare",
    treeHeading: "How your skills compare",
    treeSub: "Next to what {role} and the roles near it ask for.",
    nav: { quests: "Quests", tree: "Your skills" },
    navAria: "Your map",
    // the levels: the head and the copy's name for each (the file's labels carry durations)
    levelHead: "Level {n}",
    reachHead: "Reach",
    levels: { 1: "Fundamentals", 2: "Demos", 3: "One real project", reach: "Optional" },
    // the level of the side projects a person picked (2026-11-11), first on the path; no number
    sideHead: "Your side project",
    startSide: "Start a side project",
    emptySide: "Pick a side project, and it shows here as your first quest.",
    sideTag: "Written for you by a model",
    // #/map/start, the side-project flow (web/quests.js; behind CONFIG.QUESTS_ENABLED): one question per screen
    flow: {
      heading: "Start a side project",
      stepOf: "Step {n} of {m}",
      back: "← Back",
      next: "Next",
      skipStep: "Skip this",
      progressAria: "Your place in the questions",
      aim: {
        title: "Which roles are you aiming at?",
        lead: "Pick one to four roles of one field. Your side projects aim at what they ask for.",
        search: "Type a role",
        searchLabel: "Search the roles",
        hearted: "Roles you hearted",
        none: "No role matches. Try another word.",
        otherField: "Pick roles of one field. This one sits in {field}.",
        full: "Four roles is the most.",
        remove: "Remove {role}",
        fixed: "Your map has its own roles. They stay as they are.",
        // a seam: saved jobs feed this step once a saved-jobs store exists (PLAN.md, Later)
      },
      bring: {
        title: "What you bring",
        resume: "Your résumé",
        onFile: "{name} is on file.",
        band: "It reads as {band} for {role}.",
        replace: "Use another",
        noResume: "Add your résumé to go on.",
        more: "Add more about you",
        choose: "Add a file",
        moreLead: "A LinkedIn PDF, school essays or other PDFs and text files. They help aim your projects.",
        privacy: "Sent once to write your quests. Not stored.",
        added: "{name}, {chars} characters",
        drop: "Remove",
        cut: "We send the first {cap} characters of what you added.",
        cantRead: "We could not read {name}.",
        reading: "Reading {name}…",
      },
      tech: {
        title: "How technical do you feel?",
        options: { no_code: "I don't code", ai_tools: "I build with AI tools", read_code: "I can read and edit code", write_code: "I write code" },
      },
      tools: {
        title: "Which kinds of AI tools?",
        lead: "Mark what you use and what you want to learn. Leave the rest.",
        use: "Use it",
        learn: "Want to learn",
      },
      accounts: {
        title: "What do you have?",
        lead: "Your projects only go live where you have an account or would set one up.",
        have: "Have it",
        would: "Would set it up",
        no: "Rather not",
      },
      pick: {
        title: "Your side projects",
        lead: "Pick one. It joins your quests.",
        building: "Comparing your skills first…",
        writing: "Writing three side projects for you…",
        writingNote: "A model writes them from how your skills compare and your answers. It takes a little while.",
        buildWith: "Build with",
        liveOn: "Put it live on",
        choose: "Pick this one",
        picking: "Adding it…",
        more: "Write three more",
        left: "You can ask {left} more times today.",
        capped: "You asked for {cap} sets today, the most we write. Come back tomorrow.",
        noValid: "None of the projects held up. Try again, or change an answer.",
        failed: "That did not go through. Try again soon.",
        signedOut: "Your sign-in ended. Sign in again, then try.",
        byHand: "Your map came from us, by hand, so your roles stay as they are.",
        full: "Your map holds three side projects, the most it keeps.",
        expired: "Those projects ran out. Write three more.",
        noResume: "Add your résumé first.",
        noRoles: "Pick a role first.",
      },
    },
    // the Quests page: the now card, the path, up next, the empty page
    now: "Now · {level}",
    nowAria: "Your quest now",
    youShip: "You ship",
    questStates: { open: "Open", started: "Started", shipped: "Shipped", skipped: "Skipped" },
    pathAria: "Your path, level by level",
    upNext: "Up next",
    allDone: "You shipped or skipped every quest here.",
    empty: "No quests yet. You can still see where each skill stands for your roles.",
    emptyTree: "See how your skills compare",
    // the quest's own controls, for every map
    start: "Start",
    markShipped: "Mark shipped",
    skip: "Skip",
    skippedNote: "You skipped “{title}”.",
    undo: "Undo",
    bringBack: "Bring it back",
    details: "See the details",
    hide: "Hide the details",
    nextQuest: "Next quest",
    notYet: "Not yet",
    notShipped: "Not shipped yet",
    linkLabel: "The link to the live thing",
    linkStory: "The link to your résumé or profile with the new line",
    linkHint: "https://",
    linkBad: "Paste a link that starts with https://.",
    liveAt: "Live at",
    shippedOn: "Shipped {date}.",
    saving: "Saving…",
    saveFailed: "It did not save. Try again in a moment.",
    // the opened quest: what the card has, then the folded why
    card: {
      steps: "Steps",
      prompt: "Starter prompt",
      copy: "Copy",
      copied: "Copied.",
      buildWith: "Build with",
      liveOn: "Put it live on",
      why: "Why this quest",
      whyRole: "The role",
      whyCompany: "The company",
      whyYou: "You",
      classes: "Classes",
      noClass: "No class grows this one.",
      users: "Users",
      sources: "Sources",
      read: "read {date}",
      // a story card (Level 1 opens with up to two): one line of the résumé, rewritten so the skill shows; the atlas
      // reads the new line live, in the browser, and a prompt lets the person practise the rewrite with any model
      story: {
        lineToday: "Your line today",
        todayState: "It reads as {state}.",
        means: "What it means in {field}",
        meansPlain: "What it means",
        shows: "A line that shows it",
        slots: { artefacts: "Names the thing produced:", verbs: "Starts with a verb like", counterparts: "Says who it was with:", measures: "Gives a measure:" },
        tryIt: "Try a new line",
        tryHint: "The reader that read your résumé reads it here, in your browser.",
        tryAria: "Your rewritten line",
        tryPlaceholder: "The new line, in the past tense.",
        reading: "Reading…",
        result: {
          "shows": "Read on its own, the new line shows it. Put it on your résumé, then mark the quest shipped.",
          "shows in other words": "Read on its own, the new line shows it in another field's words. Closer. Use this field's words.",
          "must evidence better": "Read on its own, the new line names it but does not show it. Name the thing you produced and what changed.",
          "must build": "Read on its own, the new line does not show it. Start with one of the verbs above and name the thing you produced.",
        },
        practice: "Practise with any model",
        copy: "Copy the prompt",
        copied: "Copied.",
        fromAtlas: "From the job atlas: {role} →",
      },
    },
    // the Skill tree page: the legend bar, How you work, the Tree · List toggle, the tree, the list (the read)
    states: { "shows": "Shows", "shows in other words": "Shows in other words", "must evidence better": "Must evidence better", "must build": "Must build" },
    shippedState: "Shows, shipped {date}",
    shippedLegend: "Shows, shipped",
    postingNames: "The posting names it",
    senior: "Senior roles ask more",
    how: "How you work",
    howLead: "Every role asks for these.",
    howNone: "No quest practises it yet.",
    view: { tree: "Tree", list: "List" },
    viewAria: "Show the tree or a list",
    treeCap: "Every role asks for the trunk. Each branch holds what one role adds. Click a skill to read about it.",
    treeAria: "Your skill tree for the {label}",
    more: "More skills these roles sometimes ask for",
    moreLead: "Many {role} postings ask for these. They sit off the tree.",
    moreBack: "← More skills",
    band: "{band} for {role}.",
    readSub: "We read your résumé against what {role} postings ask for.",
    brings: "What you already bring",
    gaps: "The gaps your quests aim at",
    gapsHint: "The posting names these.",
    noQuest: "No quest builds it yet.",
    // the node panel
    node: {
      lineShows: "The line that shows it",
      lineOther: "The line that shows it in other words",
      lineHalf: "The line that names it",
      through: "It shows through {name}.",
      what: "What it is",
      roles: "Roles that ask for it",
      together: "Asked together with",
      quests: "Quests that build it",
      postingNames: "The posting at {company} names it.",
      senior: "Senior roles ask for it more.",
      since: "Shows since {date}: {title}.",
    },
    // the print page
    printPage: {
      role: "{role} at {company}",
      band: "Your fit today: {band}.",
      tree: "Where each skill stands",
      trunk: "Every role",
      shared: "Two or more roles",
      note: "The dot is the skill's state. On paper the tree keeps its states and drops its lines.",
      printed: "Printed {date}.",
    },
  };

  // ---------- About (#/about) ----------
  const about = {
    crumb: "About GradBuddy",
    heading: "About GradBuddy",
    lead: "GradBuddy helps grad students find the right jobs, build the skills those jobs ask for, and meet the right people.",
    // the verbs this visitor has (Door.verbs, the open ones): three without a campus roster, four with one
    counts: { 2: "Two things to do here, all built from live job postings.", 3: "Three things to do here, all built from live job postings.", 4: "Four things to do here, all built from live job postings." },
    jobs: "Find jobs",
    jobsLine: "One search over every open US posting we hold, for business roles and product roles. With a résumé on file, each posting says how many of its skills you show.",
    // the same line while the engineering, design and legal roles are on the site (CONFIG.TECH_ENABLED)
    jobsLineTech: "One search over every open US posting we hold, for business, product, engineering, design and legal roles. With a résumé on file, each posting says how many of its skills you show.",
    skills: "Explore careers",
    skillsLine: "Every role by field, with the skills most of its postings ask for. We read your résumé against them, in your browser and once with our AI reader. The fit says which skills are gaps.",
    classes: "Find classes",
    classesLine: "The {term} roster at Cornell Tech, read against the roles you want. Each class says which of your gaps it covers.",
    network: "Networking",
    networkLine: "Who to meet for one role, from the postings: hiring managers, people in the role and recruiters. A prep card says where to find them and what to ask.",
    networkAlumni: "Your campus email also opens a search for alumni in the role.",
    count: "What we count",
    facts: { open: "open US postings", employers: "employers", roles: "roles", classes: "{term} classes" },
    countLine: "Every number comes from job postings on employers' own careers pages. We refresh them every week. The last refresh was {date}. The business roles show US postings: {fortune} Fortune 500 companies, {startups} venture-backed startups, and {mba} employers that MBA students target.",
    topEmployers: "Employers with the most postings",
    howRead: "How we read a posting",
    howReadLine: "Keyword rules read each posting against one list of skills. A share is the fraction of postings in the current view that ask for a skill. One employer counts for at most 5% of a role. A posting the employer takes down counts as closed. It leaves the list and stays in the shares for a year.",
    editorial: "We write some parts ourselves, not the postings. These are the smaller skills inside a skill, the levels from entry to lead, and how to build each skill. Every quoted sentence comes from a posting.",
    privacy: "Privacy",
    privacyEvents: "We count which screens a visit reaches and how long each stays open while you use it. Each count carries a random id for the visit and one for this browser. So a return visit reads as one. It also carries your program and stage answers and the role or field on screen. With a sign-in it carries your account id. It never carries text, a skill or a file name.",
    privacyEmail: "We keep an email you type into the door or a box, to send you what we build. We keep the role on screen with it, nothing else. Your résumé text goes once to our AI reader, a Claude model from Anthropic. It finds the skills your résumé shows without naming them. We do not store the text, and no syllabus or pasted posting leaves your browser.",
    privacySaved: "With a sign-in we keep your answers, the roles you heart, and your read of each role. A read is which skills show, the one résumé line that showed each, and the gaps. Never the file. A button on About you forgets it all.",
    privacyFeedback: "We keep what you type into the Feedback box, with the screen it came from. Your email too, only if you typed it.",
    product: "Product roles",
    productLoading: "Loading the product set…",
    productLine: "{n} open postings worldwide, {us} in the US (the count Explore shows). {families} product role families at {companies} companies, refreshed {date}.",
    topCompanies: "Companies with the most postings",
  };

  // ---------- the games' shell and the game screen ----------
  const games = {
    comingSoon: "Coming soon",
    earlyDesign: "{title}, an early design",
    exploreRoles: "Explore the roles",
    storage: "Your results stay in this browser. Nothing leaves it.",
    keys: "Keys: 1 to 4 choose, Enter confirms, Esc quits.",
    infoLabel: "How this game works",
    round: "Round {i} of {n}", roundShort: "{i} of {n}",
    quit: "Quit",
    why: "Why",
    gotIt: "Got it",
    play: "Play", playRole: "Play · {role}",
    changeRole: "Change role",
    pickField: "Pick a field, then a role.",
    back: "Back",
    example: "e.g. {names}", more: ", +{n} more",
    nOpen: "{n} open",
    knowHeading: "What you know about this role",
    asksKnown: "Asks you know",
    knowMeasure: "{n} of the {m} skills that at least {share} of {role} postings ask for, got right in a game.",
    levelsSorted: "Levels sorted", postingsRead: "Postings read", demandSeen: "Demand pairs seen",
    practiceMissing: "Practice what's missing →",
    knowLine: "You know {n} things {role} postings ask for{change}.", knowCount: "{n} of the {m}", upFrom: " · up from {was}", downFrom: " · down from {was}",
  };

  // ---------- the guide: the tips per screen (web/guide.js; the usability pass of 2026-11-06) ----------
  // The chrome of the card, then one title and one body per step, by screen and step id (Guide.STEPS).
  const guide = {
    relaunch: "Show me around",
    relaunchAria: "Show the tips for this screen again",
    dialog: "Tips for this screen",
    count: "Tip {i} of {n}",
    next: "Next",
    back: "Back",
    done: "Done",
    skip: "Skip tips",
    close: "Close the tips",
    none: "This screen has no tips right now.",
    steps: {
      home: {
        verbs: { title: "Pick where to start", body: "Each card opens one part of GradBuddy. The counts come from the latest open job postings." },
        you: { title: "Tell us about you", body: "Three short questions help each screen sort fields and pick a level. You can skip them." },
        relaunch: { title: "Tips come back here", body: "Press Show me around on a screen with tips to see them again." },
      },
      classes: {
        role: { title: "Start with a role", body: "Pick a role here. Each class then shows how well it fits that role." },
        band: { title: "What high, medium and low mean", body: "The band shows how many of the role's main skills the course description names. The Gaps covered sort puts the classes that cover your gaps and fit the role first." },
        resume: { title: "Add your résumé for gaps", body: "Choose your résumé. Each card then says which of your gaps it covers." },
        gaps: { title: "How we count your gaps", body: "A gap is a skill the role asks for that your résumé does not show yet. Your study answer sets the level, so it can change this count." },
        subjects: { title: "Subject codes", body: "Each chip is a subject code, the first part of a class number. CS 5304 is a CS class." },
      },
      jobs: {
        search: { title: "Search every open job", body: "Type a title, a skill or a company. Add a city to narrow the list." },
        quick: { title: "Three quick filters", body: "Press one to keep jobs that say they sponsor a visa, jobs for new graduates or remote jobs. The number on each says how many stay." },
        fields: { title: "Narrow by field and more", body: "Pick a field, then a role inside it, to see only their postings. The rail also filters by level, employer, visa sponsorship and more." },
        card: { title: "See your skills on each card", body: "Add your résumé, and each card counts the skills you show for that posting." },
        cardFit: { title: "Your skills on each card", body: "This line counts the posting's skills that your résumé shows. The skills you show turn green." },
      },
      skills: {
        fields: { title: "Pick a field", body: "Each tile is a field of jobs. Open one to see its roles and the top three skills each asks for." },
        search: { title: "Or search for a role", body: "Type a job title to jump straight to its role." },
        resume: { title: "Find roles that fit you", body: "Add your résumé here. We then list the roles closest to it." },
        resumeFit: { title: "Roles close to your résumé", body: "These roles ask for the skills your résumé shows most. Open one to see your fit." },
      },
      role: {
        level: { title: "Pick your level", body: "Each level shows what its postings ask for. Entry covers postings for new graduates." },
        areas: { title: "Skills sit in groups", body: "Each row is a group of skills. Open a row to see them, or press Expand all." },
        rail: { title: "See your fit", body: "Add your résumé in the fit box. You then see which top skills you show." },
        railFit: { title: "Your fit at a glance", body: "This line counts the top skills your résumé shows. The See all link opens every skill in two lists." },
      },
      fit: {
        level: { title: "Pick the level you want", body: "The level decides which postings count. Pick the level you aim for." },
        counts: { title: "Why two different counts", body: "The line above counts only the skills most postings ask for. These lists hold every skill postings ask for, so their numbers are larger." },
        links: { title: "Postings that ask for it", body: "Under a gap, these links open postings that ask for that skill. Read one to see how employers say it." },
        posting: { title: "Check one posting", body: "Paste a posting you like. The lists then mark the skills it asks for." },
      },
      explore: {
        views: { title: "Two ways to see fields", body: "▦ shows each field as a card, ⊞ a skill map of the fields and the skills they ask for. On a phone, tap a field on the map once to light it and again to open it." },
        cards: { title: "Pick a field", body: "Each card shows a field, some of its roles and its open jobs. Open one to see every role." },
        find: { title: "Find a skill", body: "Type a skill to open its card. The card names the roles that ask for it most." },
      },
      field: {
        roles: { title: "Roles in this field", body: "The biggest roles come first, and opening one shows what its postings ask for. On a phone, tap a role once to light its skills and again to open it." },
        chart: { title: "Skills these roles ask for", body: "Each dot is a skill. Press a dot to read what it means and which roles ask for it." },
        heart: { title: "Save a role", body: "Press the heart to keep a role. Your saved roles then show at the top of All fields." },
      },
      network: {
        role: { title: "Pick the role", body: "Choose the role you want to ask about. The advice on this page follows it." },
        types: { title: "Pick who to meet", body: "Each tab is one kind of person, like a recruiter or a hiring manager. The advice changes with your pick." },
        prep: { title: "Your prep card", body: "This card says where to find them and what to ask. It uses the role and the person you picked." },
        copy: { title: "Copy the approach", body: "Copy puts the ask and the questions on your clipboard. Paste them into a note or a message." },
      },
      you: {
        opts: { title: "Pick the closest answer", body: "Your answers sort the fields and set your level. You can change them on this page later." },
        steps: { title: "Three questions, then your résumé", body: "The bar shows how far you are. The résumé step comes last, and you can skip it." },
        answers: { title: "Your answers", body: "Press edit to change an answer. Every screen uses the new answer at once." },
        resume: { title: "Your résumé", body: "This link adds or replaces your résumé. Your fit on every role then uses the new one." },
      },
      about: {
        facts: { title: "What we count", body: "These numbers come from the latest data refresh. Home and Find jobs use the same counts." },
        employers: { title: "Who hires most", body: "Open this list to see the employers with the most open postings." },
        feedback: { title: "Tell us what is wrong", body: "Feedback opens a short box. Write one sentence, and we read every message." },
      },
      course: {
        level: { title: "Pick the level to compare", body: "We compare the course with what postings at this level ask for." },
        read: { title: "Add the course description", body: "Drop the syllabus or paste its text, then press Read the course. Nothing leaves your browser." },
        result: { title: "What the course covers", body: "Green skills are the ones the course names. Red ones are top asks it leaves out." },
      },
      play: {
        round: { title: "Your rounds", body: "Each dot is one round. The dots fill in as you play." },
        body: { title: "Play here", body: "Each round shows up here. Read it, then pick your answer." },
        tools: { title: "Rules and the way out", body: "The i button explains the rules. Quit or Esc leaves the game." },
      },
      professor: {
        tags: { title: "What they work on", body: "These tags come from the professor's public profile." },
        classes: { title: "Their classes this term", body: "Each row opens that class in Find classes." },
        gaps: { title: "Gaps their classes cover", body: "These are skills your résumé lacks for your roles. Each code is a class of theirs that covers one." },
        angle: { title: "What to talk about", body: "These notes suggest topics to raise when you meet them." },
      },
      event: {
        kinds: { title: "Pick the kind of event", body: "Each chip changes the advice: a networking event, a roundtable or a hackathon." },
        employers: { title: "Who hires in this field", body: "These employers post the most jobs in this field. Look for them at the event." },
        roundtable: { title: "Go role by role", body: "Each card names what one role asks for most. Read it before you talk to someone in that role." },
        build: { title: "What to build", body: "These skills come up across the field's roles. Most lines name a small step to practise one." },
      },
    },
  };

  return { fill, common, door, home, intake, you, explore, role, fit, jobs, skills, network, classes, signin, heart, feedback, map, about, games, guide };
});
