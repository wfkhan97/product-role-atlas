// Pure parts of evals/infer.mjs (the model read eval), apart so tests/web/infer.test.mjs can check them without the
// files, the graph or the network: the audit of one answer, a band move, and the aggregate over the full set.

// The band order of Matcher.bandOf, lowest first; null (no bands for the group) sits below every band
export const BAND_ORDER = ["different", "related", "in_range", "strong"];
const rank = b => b == null ? -1 : BAND_ORDER.indexOf(b);
// "up", "down" or null when the band holds (or neither side has one)
export function bandMove(before, after) {
  if (before === after) return null;
  const a = rank(before), b = rank(after);
  return b > a ? "up" : b < a ? "down" : null;
}

// What must never reach the screens, checked again on the kept items whatever the route's validation says:
// a credential or a behaviour (the matcher skips both; the route never offers them) and a quoted line the resume does
// not hold (compared as web/api/infer.js compares: no case, punctuation or spacing). `skills` maps an id to its
// taxonomy entry ({ cluster, kind }); `norm` is the route's normalizer.
export function audit(items, text, skills, norm) {
  const t = norm(text), out = { credentials: [], behaviours: [], ungrounded: [], unknown: [] };
  for (const x of items || []) {
    const s = skills[x.id];
    if (!s) out.unknown.push(x.id);
    else if (s.cluster === "credentials") out.credentials.push(x.id);
    else if (s.kind === "behaviour") out.behaviours.push(x.id);
    const q = norm(x.line);
    if (!q || !t.includes(q)) out.ungrounded.push(x.id);
  }
  return out;
}

// The aggregate over the read resumes. rows: [{ id, inferred: [{ id }], move: "up" | "down" | null, audit, ms,
// cost }]. Returns { read, mean, max, top: [[skill id, count]] (the `topN` most inferred), up, down, credentials,
// behaviours, ungrounded, unknown (each a count over all rows), ms, cost }.
export function summarize(rows, topN = 20) {
  const count = {}; let total = 0, max = 0, up = 0, down = 0, ms = 0, cost = 0;
  const bad = { credentials: 0, behaviours: 0, ungrounded: 0, unknown: 0 };
  for (const r of rows) {
    const n = (r.inferred || []).length; total += n; max = Math.max(max, n);
    for (const x of r.inferred || []) count[x.id] = (count[x.id] || 0) + 1;
    if (r.move === "up") up++; else if (r.move === "down") down++;
    for (const k of Object.keys(bad)) bad[k] += ((r.audit || {})[k] || []).length;
    ms += r.ms || 0; cost += r.cost || 0;
  }
  const top = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN);
  return { read: rows.length, mean: rows.length ? total / rows.length : 0, max, top, up, down, ...bad, ms, cost };
}

// Haiku 5.5 rates (prompts up to 100K tokens): dollars for a usage record, or an estimate from characters (about four
// per token) when the answer came through the route, which returns no usage. Thinking is not in the estimate.
export const RATES = { in: 0.10, cacheRead: 0.01, cacheWrite: 0.125, out: 0.50 };
export function costOf(usage, est) {
  if (usage) return ((usage.input_tokens || 0) * RATES.in + (usage.cache_read_input_tokens || 0) * RATES.cacheRead + (usage.cache_creation_input_tokens || 0) * RATES.cacheWrite + (usage.output_tokens || 0) * RATES.out) / 1e6;
  if (est) return ((est.inChars || 0) / 4 * RATES.in + (est.outChars || 0) / 4 * RATES.out) / 1e6;
  return 0;
}
