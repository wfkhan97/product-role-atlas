/* Site configuration, loaded before every other script. CATALOG_SOURCE "files" is the only source the site ships: the
   class picker reads the public files each campus entry names in data/sp27_campus.json (catalog_file, tags_file), and
   no screen opens a database client or asks for a session. The Supabase URL and publishable key stay for
   web/capture.js, which posts funnel events with them; the key is safe for browsers (row-level security: anonymous
   insert only). AUTH_ENABLED stays off: nothing behind the picker is private. */
window.CONFIG = {
  SUPABASE_URL: "https://qqkzbzwmpkrmlicoxijy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_3wfHOcJvv4MxXeEzd-wsNA_tLKjpqzc",
  CATALOG_SOURCE: "files",
  AUTH_ENABLED: false,
  CATALOG_TERM: "SP27",
  // the waitlist and the funnel counts (web/capture.js): off, nothing leaves the browser at all
  CAPTURE_ENABLED: true,
};
