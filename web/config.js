/* Site configuration, loaded before every other script. The Supabase publishable key is safe for browsers: row-level
   security lets a signed-in cornell.edu account read the catalog tables and nothing else. AUTH_ENABLED is the launch
   switch: off, the top bar shows no "Sign in" and #/classes does not demand a session before it tries to read. */
window.CONFIG = {
  SUPABASE_URL: "https://qqkzbzwmpkrmlicoxijy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_3wfHOcJvv4MxXeEzd-wsNA_tLKjpqzc",
  AUTH_ENABLED: false,
  CATALOG_TERM: "SP27",
};
