// The copy checker (v19 B6, "How to write"): the three rules a screen's string must follow, as pure functions over
// strings, shared by evals/copy.mjs (the report and the baseline) and tests/web/copy.test.mjs (the gate on the three
// files the screens own: web/copy.js, web/data/sp27_campus.json, web/data/games.json).
//   sentences(s)         the sentences of a string: split on . ? ! ; code spans (`…`) and URLs taken out first
//   wordCount(sentence)  words, a {slot} counting as one
//   longSentences(s)     every sentence over MAX_WORDS words
//   passives(s)          every passive construction: a form of "be" (is, are, was, were, be, been, being) followed
//                        within two words by a word ending in "ed" or an irregular past participle (IRREGULAR)
//   stoplisted(s)        every word of the stoplist (STOPLIST) in the string
//   check(s)             { long: [...], passive: [...], stop: [...] } for one string
//   strings(value)       every string value of a JSON-like value, recursively, with its path ("a.b[2]")
//   checkAll(entries)    the offenders of a list of { path, text }: [{ path, text, rule, hit }]
export const MAX_WORDS = 20;
export const STOPLIST = ["utilize", "leverage", "facilitate", "in order to", "via"];
// each stoplist word as a stem, so "utilizes", "leveraging" and "facilitation" count too; "via" is a whole word
const STOP_RE = { utilize: /\butili[sz]/, leverage: /\bleverag/, facilitate: /\bfacilitat/, "in order to": /\bin\s+order\s+to\b/, via: /\bvia\b/ };
// the past participles that do not end in "ed" and come up in product copy; a form of "be" before one reads as passive
export const IRREGULAR = ["begun", "bought", "broken", "brought", "built", "caught", "chosen", "come", "cut", "done", "drawn", "driven", "eaten", "fed", "felt", "forgotten", "found", "given", "gone", "grown", "had", "held", "hidden", "hit", "kept", "known", "laid", "led", "left", "lent", "let", "lost", "made", "meant", "met", "paid", "put", "read", "run", "said", "seen", "sent", "set", "shown", "shut", "sold", "spent", "split", "spoken", "spread", "stuck", "taken", "taught", "thought", "told", "understood", "won", "worn", "written"];
// words that end in "ed" and are not participles (a be-form before them is no passive)
const NOT_PARTICIPLE = new Set(["need", "speed", "indeed", "feed", "seed", "shed", "bed", "red", "wed", "ahead", "instead", "hundred", "sacred", "naked", "wicked", "allied"]);
const BE = new Set(["is", "are", "was", "were", "be", "been", "being", "am", "'s", "'re"]);

// code spans and URLs are not prose: taken out before any count
const strip = s => String(s ?? "").replace(/`[^`]*`/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, " ");

export function sentences(s) {
  return strip(s).split(/(?<=[.?!])\s+|[.?!]+(?=\s|$)/).map(x => x.trim()).filter(Boolean);
}
// a word: a run of non-space characters; a {slot} is one word; a bare separator ("·", "—", "→") is not a word
const tokens = sentence => sentence.split(/\s+/).filter(w => w && !/^[·—–→↗↑↓←×•|]+$/.test(w));
export const wordCount = sentence => tokens(sentence).length;
export const longSentences = s => sentences(s).filter(x => wordCount(x) > MAX_WORDS);

// the lower-case words of a sentence with their punctuation dropped, so "shown." and "shown" read the same
const words = sentence => tokens(sentence).map(w => w.toLowerCase().replace(/^[^a-z'{]+|[^a-z'}]+$/g, "")).filter(Boolean);
const isParticiple = w => IRREGULAR.includes(w) || (w.length >= 4 && w.endsWith("ed") && !NOT_PARTICIPLE.has(w));
export function passives(s) {
  const out = [];
  for (const sentence of sentences(s)) {
    const ws = words(sentence);
    for (let i = 0; i < ws.length; i++) {
      if (!BE.has(ws[i])) continue;
      for (let k = 1; k <= 2 && i + k < ws.length; k++) {
        if (isParticiple(ws[i + k])) { out.push(ws.slice(i, i + k + 1).join(" ")); break; }
      }
    }
  }
  return out;
}
export function stoplisted(s) {
  const t = strip(s).toLowerCase();
  return STOPLIST.filter(w => STOP_RE[w].test(t));
}
export const check = s => ({ long: longSentences(s), passive: passives(s), stop: stoplisted(s) });

// every string value of a JSON-like value, recursively, with the path it sits at; functions and numbers are skipped
export function strings(value, path = "", out = []) {
  if (typeof value === "string") out.push({ path: path || "(root)", text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}
// the offenders of a list of { path, text }, one row per rule hit
export function checkAll(entries) {
  const out = [];
  for (const { path, text } of entries) {
    const c = check(text);
    for (const hit of c.long) out.push({ path, text, rule: "long", hit: `${wordCount(hit)} words: ${hit}` });
    for (const hit of c.passive) out.push({ path, text, rule: "passive", hit });
    for (const hit of c.stop) out.push({ path, text, rule: "stop", hit });
  }
  return out;
}
