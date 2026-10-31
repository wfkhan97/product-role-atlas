// The stage answer (you.stage: looking, targeting, curious) decides what About you and the role rail lead with
// (PLAN.md v16, step 2). For each stage, the first action each screen offers must be the one the stage asks for:
// looking, a resume drop or the fields; targeting, the role search or the gaps; curious, explore or a game. The
// screens draw from the pure table Stage in web/app.js (Stage.youLead, Stage.railBlocks), so this checks that table
// and that the screens read it. Exits 1 on a violation.
//   node evals/stage.mjs
// Why no start screen: v19 B2 (2026-10-29) replaced the start screen with the door (#/) and home (#/home), and
// neither asks the stage. The owner keeps the question in About you, step 2, until he picks a place for it (v19,
// decision 8), so Stage.startRoute and the start-screen cases went with the screen; what About you and the rail lead
// with per stage, and the box on the rail and the fit screen, are checked as before.
// Why the intake heading: v19 B5 (2026-10-31) replaced the cohort application box with the intake box ("GradBuddy is
// coming soon."), so no screen names a cohort, a price or a date any more. The pure table is Intake (it replaced
// Apply); the checks below read its heading, button and done line, and the rail's three placeholders and the fit
// screen's foot still draw the box from it.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const src = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
const { Stage, Intake } = require(path.join(root, "web", "app.js"));

let fails = 0, passes = 0;
const check = (ok, msg) => { if (ok) passes++; else { fails++; console.log("FAIL " + msg); } };

// what each stage asks for, per screen: the set of first actions that answer it
const WANT = {
  looking: { you: ["drop", "fields"], rail: ["drop"], railResume: ["gaps"] },
  targeting: { you: ["role-search"], rail: ["gaps-drop", "gaps"], railResume: ["gaps"] },
  curious: { you: ["answers", "explore", "fields"], rail: ["practise", "explore"], railResume: ["gaps"] },
};
check(JSON.stringify(Stage.STAGES) === JSON.stringify(Object.keys(WANT)), "the three stages are looking, targeting, curious");
check(Stage.startRoute === undefined, "no start route: the start screen is gone (v19 B2) and the stage is asked in About you");
for (const stage of Stage.STAGES) {
  const w = WANT[stage];
  const you = Stage.firstAction(stage, "you", false), youR = Stage.firstAction(stage, "you", true);
  const rail = Stage.firstAction(stage, "rail", false), railR = Stage.firstAction(stage, "rail", true);
  check(w.you.includes(you) && w.you.includes(youR), `${stage}: About you leads with ${you} / ${youR}, wanted ${w.you.join(" or ")}`);
  check(w.rail.includes(rail), `${stage}: the rail with answers and no resume leads with ${rail}, wanted ${w.rail.join(" or ")}`);
  check(w.railResume.includes(railR), `${stage}: the rail with a resume leads with ${railR}, wanted ${w.railResume.join(" or ")}`);
  // every rail block is either a sentence or a known action, and the rail's standing links are there in both states
  for (const resume of [false, true]) { const blocks = Stage.railBlocks(stage, resume); check(blocks.includes("practise") && blocks.includes("course") && blocks.includes("classes"), `${stage}: the rail keeps its standing links (resume ${resume})`); check(new Set(blocks).size === blocks.length, `${stage}: no rail block twice (resume ${resume})`); }
  console.log(`${stage.padEnd(10)} About you leads with ${you.padEnd(12)} rail leads with ${rail.padEnd(10)} with a resume ${railR}`);
}
// the first call to action on the rail and the fit screen is the intake box, for every stage (one box everywhere
// since v18 step 1; the intake since v19 B5): its heading is "GradBuddy is coming soon.", and the screens draw the
// box from the same table
for (const stage of Stage.STAGES) for (const screen of ["rail", "fit"]) check(Stage.cta(stage, screen) === "GradBuddy is coming soon.", `${stage}: the first call to action on the ${screen} is the intake box (got "${Stage.cta(stage, screen)}")`);
check(Intake && Intake.heading === "GradBuddy is coming soon." && Intake.button === "Notify me" && /^Got it\./.test(Intake.done), "the intake box's copy is the owner's: heading, button, done line");
check(!/[Cc]ohort|\bpaid\b|Nov 14|\bApply\b/.test(JSON.stringify([Intake.heading, Intake.line, Intake.button, Intake.done, Intake.privacy, Intake.gapsLine("x")])), "no intake string names a cohort, a price, a date or applying");
check(/\$\{waitHtml\("show"\)\}/.test(src) && /\$\{waitHtml\("build"\)\}\$\{waitHtml\("ways"\)\}/.test(src), "the rail draws the intake box at its three placeholders, sources show, build, ways");
check(/applyBox\("fit", \{ always: true \}\)/.test(src), "the fit screen draws the intake box, source fit");
check(/esc\(Intake\.heading\)/.test(src) && !/Join the GradBuddy waitlist/.test(src) && !/esc\(Apply\./.test(src), "the box is drawn from Intake; the waitlist and application wordings are gone");
// the stage is asked in About you, step 2 (Q[1]), and nowhere else: the door and home never mention it
check(/key: "stage", title: "Where are you in your search\?"/.test(src), "About you asks the stage as its second question");
const doorHome = src.slice(src.indexOf("async function door()"), src.indexOf("async function skillsScreen()"));   // the door and home sit before the launcher (B5)
check(doorHome.length > 0 && !/Q\[1\]|Where are you in your search|data-stage|STAGE_SAID/.test(doorHome), "the door and home never ask the stage");
// the screens read the table, so it cannot drift from what is drawn
check(/Stage\.youLead\(y\.stage\)/.test(src), "About you reads Stage.youLead");
check(/Stage\.railBlocks\(stage, false\)/.test(src), "the rail orders its blocks by Stage.railBlocks");
console.log(`stage: ${passes} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
