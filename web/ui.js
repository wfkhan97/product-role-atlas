/* UI: the site's shared components as render helpers. Each returns an HTML string for a template literal, the way
   every screen draws, and each has one set of classes in style.css (the "components" rules). A screen that needs a
   button, a chip, a callout or a field asks here instead of writing the markup and a rule of its own, so the same
   thing looks and answers the same on every screen. A classic script (window.UI) loaded before the screens; the
   whole file is pure and loads in node for tests/web/ui.test.mjs.

   UI.cx(...parts)                  class names joined: strings, arrays, and { name: condition } objects; falsy parts drop.
   UI.attrs({ name: value })        attributes escaped; true gives the bare name, false / null / undefined drop it.
   UI.btn(label, opts)              .btn. opts: kind "primary" | "quiet" (default the outline), size "sm" | "lg",
                                    href (draws an <a>), id, type (default "button"), disabled, cls, attrs, html (label is HTML).
   UI.linkBtn(label, opts)          a sentence's link that is a button: .linkish.link. opts: id, muted, cls, attrs.
   UI.close(label, opts)            the × of a panel, a drawer, a dialog. label is its aria-label. opts: id, cls, attrs.
   UI.chip(label, opts)             .chip. opts: on, pressed (true | false: a toggle with aria-pressed), count, href,
                                    remove (the aria-label of its ×: a picked thing that can be dropped), id, cls, attrs.
   UI.pill(label, tone)             a small rounded label: tone "green" (default) | "blue" | "amber" | "neutral".
   UI.eyebrow(label, tag)           the small mono label over a group. tag default "p".
   UI.spinner()                     the one turning ring.
   UI.skel(...kinds)                a grey placeholder where content is on its way: a line, or with "box" a control.
                                    kinds: "w30" | "w50" | "w70" | "w90" (a line's width), "tall", "box", "btnw".
   UI.callout(opts)                 a tinted box that says something is happening or asks for one thing.
                                    opts: title, body (HTML), tone "green" (default) | "amber" | "plain", spinner, id, role, cls.
   UI.status(text, opts)            one line of outcome under a control. opts: tone "error" | "done" | "muted" (default),
                                    id, live (default "polite"; an error is role=alert), cls.
   UI.field(opts)                   a label over an input, a textarea or a select. opts: label, id, type (default "text";
                                    "textarea" | "select"), value, placeholder, options ([{ value, label }] for a select),
                                    size "lg", hint, attrs (on the control), cls. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UI = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function cx(...parts) {
    const out = [];
    const take = p => {
      if (!p) return;
      if (typeof p === "string") out.push(p);
      else if (Array.isArray(p)) p.forEach(take);
      else if (typeof p === "object") for (const k of Object.keys(p)) if (p[k]) out.push(k);
    };
    parts.forEach(take);
    return out.join(" ");
  }
  function attrs(o) {
    let s = "";
    for (const k of Object.keys(o || {})) {
      const v = o[k];
      if (v === false || v == null) continue;
      s += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
    }
    return s;
  }

  function btn(label, o = {}) {
    const cls = cx("btn", o.kind === "primary" && "primary", o.kind === "quiet" && "quiet", o.size === "sm" && "sm", o.size === "lg" && "lg", o.cls);
    const inner = o.html ? label : esc(label);
    if (o.href != null) return `<a class="${cls}"${attrs({ id: o.id, href: o.href, ...o.attrs })}>${inner}</a>`;
    return `<button${attrs({ type: o.type || "button", class: cls, id: o.id, disabled: !!o.disabled, ...o.attrs })}>${inner}</button>`;
  }
  const linkBtn = (label, o = {}) => `<button${attrs({ type: "button", class: cx("linkish", "link", o.muted && "muted", o.cls), id: o.id, ...o.attrs })}>${esc(label)}</button>`;
  const close = (label, o = {}) => `<button${attrs({ type: "button", class: cx("close", o.cls), id: o.id, "aria-label": label, ...o.attrs })}>×</button>`;

  function chip(label, o = {}) {
    const toggle = o.pressed === true || o.pressed === false;
    const cls = cx("chip", (o.on || o.pressed === true) && "on", o.cls);
    const n = o.count == null ? "" : `<span class="n">${esc(o.count)}</span>`;
    if (o.remove) return `<span class="${cx(cls, "chip-pick")}"${attrs({ id: o.id })}>${esc(label)}<button${attrs({ type: "button", class: "chip-x", "aria-label": o.remove, ...o.attrs })}>×</button></span>`;
    if (o.href != null) return `<a class="${cls}"${attrs({ id: o.id, href: o.href, "aria-current": o.on ? "page" : null, ...o.attrs })}>${esc(label)}${n}</a>`;
    if (toggle || o.attrs || o.id) return `<button${attrs({ type: "button", class: cls, id: o.id, "aria-pressed": toggle ? String(o.pressed) : null, ...o.attrs })}>${esc(label)}${n}</button>`;
    return `<span class="${cls}">${esc(label)}${n}</span>`;
  }
  const TONES = { green: "", blue: " blue", amber: " amber", neutral: " neutral" };
  const pill = (label, tone) => `<span class="pill${TONES[tone] || ""}">${esc(label)}</span>`;
  const eyebrow = (label, tag) => { const t = /^(p|h[1-6]|span|div|dt)$/.test(tag || "") ? tag : "p"; return `<${t} class="eyebrow">${esc(label)}</${t}>`; };
  const spinner = () => `<span class="spinner" aria-hidden="true"></span>`;
  const SKEL = new Set(["w30", "w50", "w70", "w90", "tall", "box", "btnw"]);
  const skel = (...kinds) => `<span class="${cx("skel", kinds.filter(k => SKEL.has(k)))}"></span>`;

  function callout(o = {}) {
    const cls = cx("callout", o.tone === "amber" && "amber", o.tone === "plain" && "plain", o.spinner && "busy", o.cls);
    const text = `${o.title ? `<b>${esc(o.title)}</b>` : ""}${o.body || ""}`;
    return `<div${attrs({ class: cls, id: o.id, role: o.role })}>${o.spinner ? `${spinner()}<div>${text}</div>` : text}</div>`;
  }
  function status(text, o = {}) {
    const error = o.tone === "error";
    return `<p${attrs({ class: cx("status", error && "error", o.tone === "done" && "done", o.cls), id: o.id, role: error ? "alert" : null, "aria-live": error ? null : o.live || "polite" })}>${esc(text)}</p>`;
  }
  function field(o = {}) {
    const a = { id: o.id, ...o.attrs };
    let control;
    if (o.type === "textarea") control = `<textarea${attrs({ placeholder: o.placeholder, ...a })}>${esc(o.value)}</textarea>`;
    else if (o.type === "select") control = `<select${attrs(a)}>${(o.options || []).map(x => `<option${attrs({ value: x.value, selected: String(x.value) === String(o.value ?? "") })}>${esc(x.label)}</option>`).join("")}</select>`;
    else control = `<input${attrs({ type: o.type || "text", value: o.value ?? null, placeholder: o.placeholder, ...a })}>`;
    return `<label class="${cx("field", o.size === "lg" && "lg", o.cls)}">${o.label ? `<span class="field-label">${esc(o.label)}</span>` : ""}${control}${o.hint ? `<span class="field-hint">${esc(o.hint)}</span>` : ""}</label>`;
  }

  return { esc, cx, attrs, btn, linkBtn, close, chip, pill, eyebrow, spinner, skel, callout, status, field };
});
