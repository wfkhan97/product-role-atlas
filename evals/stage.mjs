// The stage answer (you.stage: looking, targeting, curious) decides what the start screen, About you and the role rail
// lead with (PLAN.md v16, step 2). For each stage, the first action each screen offers must be the one the stage asks
// for: looking, a resume drop or the fields; targeting, the role search or the gaps; curious, explore or a game. The
// screens draw from the pure table Stage in web/app.js (Stage.startRoute, Stage.youLead, Stage.railBlocks), so this
// checks that table and that the screens read it. Exits 1 on a violation.
//   node evals/stage.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const src = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
const { Stage, Apply } = require(path.join(root, "web", "app.js"));

let fails = 0, passes = 0;
const check = (ok, msg) => { if (ok) passes++; else { fails++; console.log("FAIL " + msg); } };

// what each stage asks for, per screen: the set of first actions that answer it
const WANT = {
  looking: { start: ["program-question"], you: ["drop", "fields"], rail: ["drop"], railResume: ["gaps"] },
  targeting: { start: ["program-question"], you: ["role-search"], rail: ["gaps-drop", "gaps"], railResume: ["gaps"] },
  curious: { start: ["explore"], you: ["answers", "explore", "fields"], rail: ["practise", "explore"], railResume: ["gaps"] },
};
check(JSON.stringify(Stage.STAGES) === JSON.stringify(Object.keys(WANT)), "the three stages are looking, targeting, curious");
for (const stage of Stage.STAGES) {
  const w = WANT[stage];
  const start = Stage.firstAction(stage, "start", false), you = Stage.firstAction(stage, "you", false), youR = Stage.firstAction(stage, "you", true);
  const rail = Stage.firstAction(stage, "rail", false), railR = Stage.firstAction(stage, "rail", true);
  check(w.start.includes(start), `${stage}: the start screen's first action is ${start}, wanted ${w.start.join(" or ")}`);
  check(w.you.includes(you) && w.you.includes(youR), `${stage}: About you leads with ${you} / ${youR}, wanted ${w.you.join(" or ")}`);
  check(w.rail.includes(rail), `${stage}: the rail with answers and no resume leads with ${rail}, wanted ${w.rail.join(" or ")}`);
  check(w.railResume.includes(railR), `${stage}: the rail with a resume leads with ${railR}, wanted ${w.railResume.join(" or ")}`);
  // the route the stage card takes: a hash the router knows
  const route = Stage.startRoute(stage);
  check(/^#\/(you|explore)/.test(route), `${stage}: the start route ${route} is About you or Explore`);
  check(stage === "curious" ? route === "#/explore" : /^#\/you\?step=0/.test(route), `${stage}: the start route ${route} lands where the stage asks`);
  // every rail block is either a sentence or a known action, and the rail's standing links are there in both states
  for (const resume of [false, true]) { const blocks = Stage.railBlocks(stage, resume); check(blocks.includes("practise") && blocks.includes("course") && blocks.includes("classes"), `${stage}: the rail keeps its standing links (resume ${resume})`); check(new Set(blocks).size === blocks.length, `${stage}: no rail block twice (resume ${resume})`); }
  console.log(`${stage.padEnd(10)} start → ${route.padEnd(24)} About you leads with ${you.padEnd(12)} rail leads with ${rail.padEnd(10)} with a resume ${railR}`);
}
// the first call to action on the start screen and on the rail is the cohort application box, for every stage (v18,
// step 1): its heading begins "Cohort 1", and the screens draw the box from the same table
for (const stage of Stage.STAGES) for (const screen of ["start", "rail"]) check(/^Cohort 1/.test(Stage.cta(stage, screen) || ""), `${stage}: the first call to action on the ${screen} is the application box (got "${Stage.cta(stage, screen)}")`);
check(Apply && /^Cohort 1/.test(Apply.heading) && Apply.button === "Apply" && /^Applied\./.test(Apply.done), "the application box's copy is the owner's: heading, button, done line");
check(/<section class="start-apply">\$\{applyBox\("start", \{ always: true \}\)\}<\/section>/.test(src), "the start screen draws the application box, source start");
check(/\$\{waitHtml\("show"\)\}/.test(src) && /\$\{waitHtml\("build"\)\}\$\{waitHtml\("ways"\)\}/.test(src), "the rail draws the application box at its three placeholders, sources show, build, ways");
check(/applyBox\("fit", \{ always: true \}\)/.test(src), "the fit screen draws the application box, source fit");
check(/esc\(Apply\.heading\)/.test(src) && !/Join the GradBuddy waitlist/.test(src), "the box is drawn from Apply; the waitlist wording is gone");
// the screens read the table, so it cannot drift from what is drawn
check(/Stage\.startRoute\(id\)/.test(src), "the start screen's stage cards link to Stage.startRoute");
check(/Stage\.youLead\(y\.stage\)/.test(src), "About you reads Stage.youLead");
check(/Stage\.railBlocks\(stage, false\)/.test(src), "the rail orders its blocks by Stage.railBlocks");
check(/track\("start_stage"/.test(src), "a stage card fires the start_stage event");
console.log(`stage: ${passes} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
