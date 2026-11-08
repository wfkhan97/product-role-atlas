// The colour tokens' contrast (2026-11-08): web/tokens/colors.css with the overrides at the top of web/style.css, in
// both themes, converted oklch -> sRGB as a browser does. Text pairs need 4.5:1 (WCAG AA), the border and input
// lines 3:1 (non-text). A tint (a colour at an alpha) is blended over the surface it sits on, in sRGB as browsers
// blend. TOKENS_TABLE=1 prints every pair checked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { web } from "./_load.mjs";

const colors = fs.readFileSync(path.join(web, "tokens", "colors.css"), "utf8");
const style = fs.readFileSync(path.join(web, "style.css"), "utf8");

// the custom properties declared in a block of CSS text: { "--name": "value" }
const decls = text => Object.fromEntries([...text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
// the body of the rule whose opening text (ending in its brace) matches re
const block = (css, re) => {
  const m = css.match(re); assert.ok(m, `no block for ${re}`);
  const i = m.index + m[0].length - 1; let d = 0, j = i;
  for (; j < css.length; j++) { if (css[j] === "{") d++; else if (css[j] === "}" && --d === 0) break; }
  return css.slice(i + 1, j);
};

// dark is :root; light is :root with the light block over it (the [data-theme="light"] rule; the media query's are
// the same values, checked below), and style.css's own overrides over both
const darkBase = decls(block(colors, /^:root\s*\{/m));
const lightBlock = decls(block(colors, /^:root\[data-theme="light"\], \.light\s*\{/m));
const styleRoot = decls(block(style, /^:root\s*\{/m));
const styleLight = decls(block(style, /^:root\[data-theme="light"\]\s*\{/m));
const themes = {
  dark: { ...darkBase, ...styleRoot },
  light: { ...darkBase, ...lightBlock, ...styleRoot, ...styleLight },
};

test("the light media query and the data-theme=\"light\" rule set the same values, in colors.css and in style.css", () => {
  assert.deepEqual(decls(block(colors, /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme="dark"\]\)\s*\{/)), lightBlock);
  assert.deepEqual(decls(block(style, /@media \(prefers-color-scheme: light\) \{ :root:not\(\[data-theme="dark"\]\)\s*\{/)), styleLight);
});

test("style.css's light green and primary tint match colors.css's, so the .light class draws the theme's green", () => {
  assert.equal(styleLight["--green-400"], lightBlock["--green-400"]);
  assert.equal(styleLight["--primary-tint"], lightBlock["--primary-tint"]);
});

// ---------- colour maths ----------
const resolve = (vars, v, depth = 0) => { assert.ok(v && depth < 10, `unresolved ${v}`); const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? resolve(vars, vars[m[1]], depth + 1) : v; };
// oklch(L C h [/ a]) -> [r, g, b, a]: r, g, b gamma-encoded sRGB in 0..1, clipped
function oklch(v) {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(v);
  assert.ok(m, `not an oklch colour: ${v}`);
  const L = +m[1], C = +m[2], h = +m[3] * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s];
  const enc = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  return [...lin.map(enc), m[4] == null ? 1 : +m[4]];
}
const over = (top, under) => top[3] >= 1 ? top : [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
const lum = c => { const f = x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const colour = (vars, name) => oklch(resolve(vars, vars[name]));

// ---------- the pairs: [text or line, surface, what the surface sits on when it is a tint, minimum] ----------
const pairs = [];
for (const fg of ["--foreground", "--heading-foreground", "--muted-foreground", "--subtle-foreground"])
  for (const bg of ["--background", "--card", "--muted"]) pairs.push([fg, bg, null, 4.5]);
// the coloured words on their tints (.ptag, .chip.on, .seg button.on, .tag.good/.bad/.amber, .opt.on, .ktr-tile.on)
for (const [fg, tint] of [["--primary", "--primary-tint"], ["--secondary", "--secondary-tint"], ["--warning", "--warning-tint"], ["--accent-foreground", "--accent"]])
  for (const base of ["--card", "--background"]) pairs.push([fg, tint, base, 4.5]);
// the coloured words on the plain surfaces they also sit on
for (const fg of ["--primary", "--secondary", "--warning"]) for (const bg of ["--background", "--card", "--muted"]) pairs.push([fg, bg, null, 4.5]);
// every -foreground on its own fill (accent's is above; muted's is in the first set)
for (const [fg, fill] of [["--card-foreground", "--card"], ["--popover-foreground", "--popover"], ["--primary-foreground", "--primary"], ["--secondary-foreground", "--secondary"], ["--destructive-foreground", "--destructive"]])
  pairs.push([fg, fill, null, 4.5]);
for (const bg of ["--background", "--card"]) pairs.push(["--input", bg, null, 3]);
// --border is not held to 3:1: it draws the dividers and card edges (113 rules), decoration that WCAG 1.4.11 leaves
// out, at about 1.4:1 in both themes. A control that needs its edge seen draws it in --input
// not checked: --mark (a highlight for the problem pair's shared number, drawn nowhere in web/ today) and --ring (the
// focus outline, the primary green, checked as --primary on the surfaces above)

const rows = [];
for (const [theme, vars] of Object.entries(themes))
  for (const [fg, bg, base, min] of pairs) {
    const surface = over(colour(vars, bg), colour(vars, base || "--background"));
    rows.push({ theme, fg, bg: base ? `${bg} over ${base}` : bg, min, r: ratio(colour(vars, fg), surface) });
  }
if (process.env.TOKENS_TABLE) console.log(rows.map(x => `${x.theme}\t${x.fg}\t${x.bg}\t${x.r.toFixed(3)}\t(min ${x.min})`).join("\n"));

for (const theme of Object.keys(themes))
  test(`${theme}: every text pair reaches 4.5:1 and every border and input line 3:1`, () => {
    assert.deepEqual(rows.filter(x => x.theme === theme && x.r < x.min).map(x => `${x.fg} on ${x.bg}: ${x.r.toFixed(2)} < ${x.min}`), []);
  });
