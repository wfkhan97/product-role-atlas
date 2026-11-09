/* Pick: one searchable select for every screen that lets a person choose a role, a company, a professor or a field.
   A text box that filters a list as you type, with the whole list a click away (the ▾ button or a click in the box;
   focus alone never opens it), so it works both as a drop-down and as a search. Keyboard: ↓ ↑ move, Enter picks, Esc closes; typing the
   full label and leaving the box also picks. A classic script (window.Pick) loaded before the screens; the pure
   part `filter` loads in node for tests/web/pick.test.mjs.
   Pick.mount(el, { options: [{ value, label, hint? }], value, placeholder, label (aria-label), allowEmpty,
   onChange(value, option) }) draws into el and returns { get(), set(value), focus(), destroy() }; focus() puts the
   caret in the box (a screen hands focus back after a redraw). The list is a named listbox (the label, else the
   input's own name) wired to the box by aria-controls and aria-activedescendant; rows that are not options are
   presentation. Two options with the same
   label are told apart in the label itself by their hint ("Product Marketing Manager (Marketing)"; `distinct`).
   opts.help (optional) fills the empty list when nothing matches: the closest options (`closest`) and a few notes.
   Styles: `.pick` in style.css. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Pick = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9&+ ]+/g, " ").replace(/\s+/g, " ").trim();
  // the options whose label (or hint) holds every word typed; "" gives every option. The order: the label typed in
  // full first, then a label that starts with all that was typed ("product manager" puts Product Manager before
  // Product Marketing Manager), then one that starts with the first word, then the rest; ties keep the list's order.
  function filter(options, q) {
    const words = norm(q).split(" ").filter(Boolean);
    if (!words.length) return options.slice();
    const typed = words.join(" ");
    const hit = o => { const l = norm(o.label), h = norm(o.hint); return words.every(w => l.includes(w) || h.includes(w)); };
    const rank = o => { const l = norm(o.label); return l === typed ? 0 : l.startsWith(typed) ? 1 : l.startsWith(words[0]) ? 2 : 3; };
    return options.filter(hit).map((o, i) => [o, rank(o), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
  }
  // two or more options with the same label: each says its hint in the label ("Product Marketing Manager (Marketing)")
  // and drops the hint, so the list never shows two rows that read the same; a label used once stays as it is
  function distinct(options) {
    const n = {};
    for (const o of options) { const k = norm(o.label); n[k] = (n[k] || 0) + 1; }
    return options.map(o => n[norm(o.label)] > 1 && o.hint ? { ...o, label: `${o.label} (${o.hint})`, hint: "" } : o);
  }
  // When nothing matches: the options closest to what was typed (the usability pass of 2026-11-06: "data" and "software"
  // found no role and said nothing more). A typed word of three letters or more hits a text when a word of the text
  // starts with it ("data" hits "data-driven"); the label counts 3, the hint (the field) 2, each `about` line (a blurb,
  // a skill the option asks for) 1 divided by the number of options whose about lists that line, so a line every
  // option has ("Data-driven decision making") counts next to nothing. The best n with a score, ties in list order;
  // with none, the n options with the highest `lean` (a number the screen gives, e.g. how technical a role's asks
  // are), else [].
  function closest(options, q, n) {
    n = n || 3;
    const words = norm(q).split(" ").filter(w => w.length >= 3);
    const hits = (text, w) => norm(text).split(" ").some(t => t.startsWith(w));
    const lines = o => (o.about || []).map(norm).filter(Boolean);
    const count = {};
    for (const o of options) for (const l of new Set(lines(o))) count[l] = (count[l] || 0) + 1;
    const score = o => words.reduce((sum, w) => sum + (hits(o.label, w) ? 3 : 0) + (hits(o.hint, w) ? 2 : 0) + [...new Set(lines(o))].filter(l => hits(l, w)).reduce((a, l) => a + 1 / count[l], 0), 0);
    const scored = options.map((o, i) => [o, words.length ? score(o) : 0, i]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
    if (scored.length) return scored.slice(0, n).map(x => x[0]);
    return options.map((o, i) => [o, Number(o.lean) || 0, i]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, n).map(x => x[0]);
  }
  const MAX = 60;
  let mounts = 0;
  function mount(el, opts) {
    opts = opts || {};
    const options = distinct((opts.options || []).map(o => typeof o === "string" ? { value: o, label: o } : o));
    const byValue = v => options.find(o => o.value === v) || null;
    let value = opts.value != null && byValue(opts.value) ? opts.value : "", open = false, active = -1, shown = [];
    const lid = `pick-${++mounts}`;
    el.classList.add("pick");
    el.innerHTML = `<input type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${lid}" autocomplete="off" spellcheck="false" placeholder="${esc(opts.placeholder || "")}"${opts.label ? ` aria-label="${esc(opts.label)}"` : ""}><button type="button" class="pick-toggle" aria-label="Show the list" tabindex="-1">▾</button><ul class="pick-list" id="${lid}" role="listbox" tabindex="-1" hidden></ul>`;
    const input = el.querySelector("input"), list = el.querySelector("ul"), toggle = el.querySelector(".pick-toggle");
    // the listbox's name: the picker's label, else what names the input (a <label for>, an aria-label set by the screen)
    const name = opts.label || input.getAttribute("aria-label") || (input.labels && input.labels[0] ? input.labels[0].textContent.trim() : "") || opts.placeholder || "";
    if (name) list.setAttribute("aria-label", name);
    const labelOf = v => { const o = byValue(v); return o ? o.label : ""; };
    // help: { closest: n, lead, notes: [strings] } turns "No match." into a way on: the lead, the n closest options
    // (Pick.closest; they pick like any option) and the notes (what the list covers, what comes later)
    let suggesting = false;
    const row = (o, i) => `<li role="option" id="${lid}-${i}" data-i="${i}" aria-selected="${o.value === value}" class="${i === active ? "active" : ""}${o.value === value ? " picked" : ""}">${esc(o.label)}${o.hint ? ` <span class="pick-hint">${esc(o.hint)}</span>` : ""}</li>`;
    const draw = () => {
      shown = filter(options, open ? input.value : "").slice(0, MAX);
      if (opts.allowEmpty && !input.value) shown = [{ value: "", label: opts.emptyLabel || "—" }, ...shown];
      const H = opts.help;
      suggesting = !shown.length && !!H;
      if (suggesting) shown = closest(options, input.value, H.closest || 3);
      // the "No match." row is presentation beside options; alone it is a disabled option, so the listbox is never empty
      const none = shown.length ? `role="presentation"` : `role="option" aria-disabled="true" aria-selected="false"`;
      list.innerHTML = suggesting
        ? `<li class="pick-none" ${none}>${esc(opts.noMatch || "No match.")}${shown.length && H.lead ? " " + esc(H.lead) : ""}</li>${shown.map(row).join("")}${(H.notes || []).map(t => `<li class="pick-note" role="presentation">${esc(t)}</li>`).join("")}`
        : shown.length ? shown.map(row).join("") : `<li class="pick-none" ${none}>${esc(opts.noMatch || "No match.")}</li>`;
      list.hidden = !open; input.setAttribute("aria-expanded", String(open));
      const li = open && active >= 0 ? list.querySelector(`li[data-i="${active}"]`) : null;
      if (li) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } else input.removeAttribute("aria-activedescendant");
    };
    const show = () => { if (open) return; open = true; active = -1; draw(); };
    const hide = () => { if (!open) return; open = false; active = -1; input.value = labelOf(value); draw(); };
    const pick = v => { const o = byValue(v) || (v === "" && opts.allowEmpty ? { value: "", label: "" } : null); if (!o) { hide(); return; } const changed = o.value !== value; value = o.value; open = false; active = -1; input.value = o.label; draw(); if (changed && opts.onChange) opts.onChange(o.value, byValue(o.value)); };
    // focus selects the text and nothing more: a screen or the guide handing focus back must not open the list
    input.addEventListener("focus", () => input.select());
    input.addEventListener("click", show);
    input.addEventListener("input", () => { open = true; active = -1; draw(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) show(); active = Math.min(active + 1, shown.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); const o = active >= 0 ? shown[active] : suggesting ? null : shown.length === 1 ? shown[0] : shown.find(x => norm(x.label) === norm(input.value)); if (o) pick(o.value); else if (!suggesting) hide(); }
      else if (e.key === "Escape") { hide(); input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (!el.contains(document.activeElement)) { const o = shown.find(x => norm(x.label) === norm(input.value)); if (o && o.value !== value) pick(o.value); else if (opts.allowEmpty && !input.value.trim() && value) pick(""); else hide(); } }, 120));
    list.addEventListener("mousedown", e => { const li = e.target.closest("li[data-i]"); if (!li) return; e.preventDefault(); pick(shown[+li.dataset.i].value); input.blur(); });
    toggle.addEventListener("mousedown", e => { e.preventDefault(); if (open) { hide(); input.blur(); } else { input.value = ""; input.focus(); show(); } });
    const onDoc = e => { if (!el.contains(e.target)) hide(); };
    document.addEventListener("mousedown", onDoc);
    input.value = labelOf(value); draw();
    return { get: () => value, set(v) { value = byValue(v) ? v : ""; input.value = labelOf(value); draw(); }, focus() { input.focus({ preventScroll: true }); }, destroy() { document.removeEventListener("mousedown", onDoc); el.innerHTML = ""; el.classList.remove("pick"); } };
  }
  return { filter, distinct, closest, mount, norm };
});
