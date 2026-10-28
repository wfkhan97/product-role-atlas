/* Site configuration, loaded before every other script. The Supabase publishable key is safe for browsers: row-level
   security lets a signed-in cornell.edu account read the catalog tables and nothing else. AUTH_ENABLED is the launch
   switch: off, the top bar shows no "Sign in" and #/classes does not demand a session before it tries to read.
   CATALOG_OPEN is the test switch (PLAN.md, "Sign-in paused behind a flag", 2026-10-28): on, every sign-in gate on
   the page is paused (the picker, the professor card and the role rail read the roster with no session and show no
   sign-in words), which only works while the anon-read policy of pipeline/sql/2026-10-28_open_read.sql is applied on
   the catalog project; off, the gates are back exactly as before. Set it false before the site is launched. */
window.CONFIG = {
  SUPABASE_URL: "https://qqkzbzwmpkrmlicoxijy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_3wfHOcJvv4MxXeEzd-wsNA_tLKjpqzc",
  AUTH_ENABLED: false,
  CATALOG_OPEN: true,
  // IE New York in the interface: the second campus (the chooser on #/classes, its start card, its programs, the
  // application copy). A campus entry in data/sp27_campus.json names the switch that shows it (`enabled_by`); off,
  // the site is Cornell Tech only and an IE choice kept in a browser falls back to Cornell Tech. Flip it when the IE
  // courses are loaded and the IE sign-in domain is known (PLAN.md, Later).
  IENYC_ENABLED: false,
  CATALOG_TERM: "SP27",
  // the waitlist and the funnel counts (web/capture.js): off, nothing leaves the browser at all
  CAPTURE_ENABLED: true,
};
