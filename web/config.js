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
  // IE New York in the interface (2026-10-31): the second campus's entry in data/sp27_campus.json names this switch
  // (`enabled_by`), and Catalog.campuses() lists a campus only while its switch is on. Off, the site is Cornell Tech
  // only (the chooser on #/classes, the start card, campusFor); an IE choice kept in a browser falls back to Cornell
  // Tech. Flip it when the IE courses are loaded (PLAN.md, Later).
  IENYC_ENABLED: false,
  CATALOG_TERM: "SP27",
  // the waitlist and the funnel counts (web/capture.js): off, nothing leaves the browser at all
  CAPTURE_ENABLED: true,
  // The two Tally forms (web/doors.js, v19 B7): `door` is the form at #/, `intake` the box at each verb's foot. The
  // owner fills the two ids (the part after tally.so/r/). Until an id is set the native form renders in its place;
  // the site never shows a blank box.
  TALLY: { door: "1WX741", intake: "M1Xzak" },
};
