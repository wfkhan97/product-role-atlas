/* Site configuration, loaded before every other script. CATALOG_SOURCE "files" is the only source the site ships: the
   class picker reads the public files each campus entry names in data/sp27_campus.json (catalog_file, tags_file), and
   no screen opens a database client. The Supabase URL and publishable key serve web/capture.js, which posts funnel
   events with them, and web/auth.js, the magic link and the private maps bucket (MAPS_ENABLED); the key is safe for
   browsers (row-level security: anonymous insert on the capture tables, a person's own folder in `maps`).
   AUTH_ENABLED stays off: nothing behind the picker is private. The apprentice maps are the one private thing, and
   their sign-in is MAPS_ENABLED's, not this switch's. */
window.CONFIG = {
  SUPABASE_URL: "https://qqkzbzwmpkrmlicoxijy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_3wfHOcJvv4MxXeEzd-wsNA_tLKjpqzc",
  CATALOG_SOURCE: "files",
  AUTH_ENABLED: false,
  // The apprentice maps (the build plan's B2, 2026-11-03): on, #/signin sends a magic link to an invited address,
  // #/map reads the person's own maps/<uid>/map.json with their session (web/auth.js), and Build skills (#/skills)
  // opens the map first for a signed-in person who has one. Off, #/signin is the one line it was and #/map goes to
  // the launcher. The owner's steps are in pipeline/sql/2026-11-03_maps.sql.
  MAPS_ENABLED: true,
  // The self-serve tree (the visitor journey, step 4, 2026-11-05): on, a signed-in person with no map builds one on
  // #/map from their résumé and the roles they pick (POST /api/tree, web/api/tree.js: the class tree, the read and the
  // story cards; no model). Off, #/map waits for the owner's map as before. The function needs
  // CATALOG_SERVICE_ROLE_KEY in the Vercel project's environment and answers 503 without it.
  TREE_ENABLED: false,
  /* The feedback box and its prompt (the visitor journey, step 6, 2026-11-05; web/feedback.js). On since the
     `feedback` table was applied (pipeline/sql/2026-11-05_feedback.sql): PostgREST refuses a row for a table it
     lacks, so the flag never runs ahead of the migration. Needs no sign-in and no tree. */
  FEEDBACK_ENABLED: true,
  // IE New York in the interface (2026-10-31): the second campus's entry in data/sp27_campus.json names this switch
  // (`enabled_by`), and Catalog.campuses() lists a campus only while its switch is on. Off, the site is Cornell Tech
  // only (the chooser on #/classes, the start card, campusFor); an IE choice kept in a browser falls back to Cornell
  // Tech. Flip it when the IE courses are loaded (PLAN.md, Later).
  IENYC_ENABLED: false,
  // The campus flags (2026-11-04): the door's email read by its domain (Door.campus in app.js). A flag id holds the
  // email domains that are that school's, matched whole and in any case: "cornell.edu" takes wk332@cornell.edu and
  // john.smith@cornell.edu, never wk332@alumni.cornell.edu. A flag links to a roster through the `flag` of a campus
  // entry in data/sp27_campus.json: Find classes and the Faculty tab open only for a flag with a listed campus whose
  // roster is loaded (catalog: true), and the alumni searches carry the flag's school filter (web/network.js SCHOOLS).
  // An address with no flag sees the three verbs and the three non-school people types.
  // ienyc: the student address and the staff and alumni address (owner, 2026-11-04). Johnson Ithaca is next: a new
  // flag id here, its campus entry and its school filter.
  CAMPUS_DOMAINS: {
    cornell: ["cornell.edu"],
    ienyc: ["student.ie.edu", "ie.edu"],
  },
  // The tech role set (engineering, design, legal; PLAN.md "A third role set", 2026-11-05): on, Atlas.index() also loads
  // data/graph_tech.json and its fields join the field list, its roles open as "tech.<id>" with their own matcher. Off
  // until every product eval has its tech counterpart (PLAN.md lists what is still owed) and the owner says so; with
  // the switch on and no graph_tech.json (before the first refresh-tech lands), the site shows no tech field.
  TECH_ENABLED: false,
  CATALOG_TERM: "SP27",
  // the waitlist and the funnel counts (web/capture.js): off, no funnel row or event leaves the browser
  CAPTURE_ENABLED: true,
  // the visitor journey's logging (PLAN.md, "The visitor journey", step 1): the visitor id, the screen on every event,
  // the heartbeat and the cta rows. On since 2026-11-05, when pipeline/sql/2026-11-05_journey.sql was applied.
  JOURNEY_ENABLED: true,
  // the visitor journey's sign-in (step 2): email plus a six-digit code for anyone, at the first personal act (the
  // résumé read), the address and Sign out in the top bar, the door's own form instead of Tally's. Off until the
  // owner has, in the gradbuddy-catalog project: a custom SMTP sender, sign-ups on, the magic-link email template
  // carrying {{ .Token }} (PLAN.md, "The visitor journey", step 2).
  ACCOUNTS_ENABLED: false,
  // The model read of a resume (web/infer.js, web/api/infer.js; 2026-11-01): on, the resume text goes once per upload
  // to the site's /api/infer route, which asks a model for the skills it shows without naming them and stores nothing.
  // Off, or with no ANTHROPIC_API_KEY on the host (a 503), the resume never leaves the browser and the patterns read alone.
  INFER_ENABLED: true,
  // The Tally forms (web/doors.js, v19 B7; per kind and per theme since 2026-11-01): `door` is the form at #/, each
  // `intake_<surface>` the box of that surface, with its own line. A Tally theme is a per-form setting, so every kind
  // has a LIGHT and a DARK copy; the site embeds the one matching its theme and swaps when the theme changes (app.js).
  // An id is the part after tally.so/r/. A kind left out takes intake_skills' pair; an id left null draws the native
  // form, so the site never shows a blank box. The copies share the structure: hidden fields surface, source, variant
  // (door) or surface, source, role, variant, email (intakes); the email question (you@school.edu); the privacy line;
  // the owner's notification email; the intakes' thank-you page; the door's redirect to
  // #/home?email=@Email&where=@What are you studying? ("What are you studying?" optional). A change to one copy goes to
  // its twin.
  //   kind                 light    dark     the form's line
  //   door                 1WX741   6DLRak   the door: email and "What are you studying?"
  //   intake_skills        M1Xzak   1WXMqp   Copy.intake.line.skills (the rail, the fit screen, the launcher)
  //   intake_positioning   J1qL5o   gbaLKO   Copy.intake.line.positioning (the role rail's gap rows)
  //   intake_classes       yXMxVg   8NqG75   Copy.intake.line.classes (the class picker's foot)
  //   intake_network       0VdLNy   zEjZPR   Copy.intake.line.network (the networking screen)
  TALLY: {
    door: { light: "1WX741", dark: "6DLRak" },
    intake_skills: { light: "M1Xzak", dark: "1WXMqp" },
    intake_positioning: { light: "J1qL5o", dark: "gbaLKO" },
    intake_classes: { light: "yXMxVg", dark: "8NqG75" },
    intake_network: { light: "0VdLNy", dark: "zEjZPR" },
  },
};
