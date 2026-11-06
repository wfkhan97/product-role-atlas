/* Pick: one searchable select for every screen that lets a person choose a role, a company, a professor or a field.
   A text box that filters a list as you type, with the whole list a click away (the ▾ button or focusing the empty
   box), so it works both as a drop-down and as a search. Keyboard: ↓ ↑ move, Enter picks, Esc closes; typing the
   full label and leaving the box also picks. A classic script (window.Pick) loaded before the screens; the pure
   part `filter` loads in node for tests/web/pick.test.mjs.
   Pick.mount(el, { options: [{ value, label, hint? }], value, placeholder, label (aria-label), allowEmpty,
   onChange(value, option) }) draws into el and returns { get(), set(value), focus(), destroy() }; focus() puts the
   caret in the box without opening the list (a screen hands focus back after a redraw). Two options with the same
   label are told apart in the label itself by their hint ("Product Marketing Manager (Marketing)"; `distinct`).
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
  const MAX = 60;
  function mount(el, opts) {
    opts = opts || {};
    const options = distinct((opts.options || []).map(o => typeof o === "string" ? { value: o, label: o } : o));
    const byValue = v => options.find(o => o.value === v) || null;
    let value = opts.value != null && byValue(opts.value) ? opts.value : "", open = false, active = -1, shown = [], quiet = false;
    el.classList.add("pick");
    el.innerHTML = `<input type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(opts.placeholder || "")}"${opts.label ? ` aria-label="${esc(opts.label)}"` : ""}><button type="button" class="pick-toggle" aria-label="Show the list" tabindex="-1">▾</button><ul class="pick-list" role="listbox" hidden></ul>`;
    const input = el.querySelector("input"), list = el.querySelector("ul"), toggle = el.querySelector(".pick-toggle");
    const labelOf = v => { const o = byValue(v); return o ? o.label : ""; };
    const draw = () => {
      shown = filter(options, open ? input.value : "").slice(0, MAX);
      if (opts.allowEmpty && !input.value) shown = [{ value: "", label: opts.emptyLabel || "—" }, ...shown];
      list.innerHTML = shown.length ? shown.map((o, i) => `<li role="option" data-i="${i}" aria-selected="${o.value === value}" class="${i === active ? "active" : ""}${o.value === value ? " picked" : ""}">${esc(o.label)}${o.hint ? ` <span class="pick-hint">${esc(o.hint)}</span>` : ""}</li>`).join("") : `<li class="pick-none">${esc(opts.noMatch || "No match.")}</li>`;
      list.hidden = !open; input.setAttribute("aria-expanded", String(open));
      if (active >= 0 && list.children[active]) list.children[active].scrollIntoView({ block: "nearest" });
    };
    const show = () => { if (open) return; open = true; active = -1; draw(); };
    const hide = () => { if (!open) return; open = false; active = -1; input.value = labelOf(value); draw(); };
    const pick = v => { const o = byValue(v) || (v === "" && opts.allowEmpty ? { value: "", label: "" } : null); if (!o) { hide(); return; } const changed = o.value !== value; value = o.value; open = false; active = -1; input.value = o.label; draw(); if (changed && opts.onChange) opts.onChange(o.value, byValue(o.value)); };
    input.addEventListener("focus", () => { input.select(); if (!quiet) show(); });
    input.addEventListener("input", () => { open = true; active = -1; draw(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) show(); active = Math.min(active + 1, shown.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); const o = active >= 0 ? shown[active] : shown.length === 1 ? shown[0] : shown.find(x => norm(x.label) === norm(input.value)); if (o) pick(o.value); else hide(); }
      else if (e.key === "Escape") { hide(); input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (!el.contains(document.activeElement)) { const o = shown.find(x => norm(x.label) === norm(input.value)); if (o && o.value !== value) pick(o.value); else if (opts.allowEmpty && !input.value.trim() && value) pick(""); else hide(); } }, 120));
    list.addEventListener("mousedown", e => { const li = e.target.closest("li[data-i]"); if (!li) return; e.preventDefault(); pick(shown[+li.dataset.i].value); input.blur(); });
    toggle.addEventListener("mousedown", e => { e.preventDefault(); if (open) { hide(); input.blur(); } else { input.value = ""; input.focus(); } });
    const onDoc = e => { if (!el.contains(e.target)) hide(); };
    document.addEventListener("mousedown", onDoc);
    input.value = labelOf(value); draw();
    return { get: () => value, set(v) { value = byValue(v) ? v : ""; input.value = labelOf(value); draw(); }, focus() { quiet = true; try { input.focus({ preventScroll: true }); } finally { quiet = false; } }, destroy() { document.removeEventListener("mousedown", onDoc); el.innerHTML = ""; el.classList.remove("pick"); } };
  }
  return { filter, distinct, mount, norm };
});
