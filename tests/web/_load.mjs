// Shared by the tests in this directory (not a test file itself): paths, and the web scripts loaded the way the
// evals load them, with web/data/ read from disk instead of fetched.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const web = path.join(root, "web");
export const require = createRequire(import.meta.url);
export const readJson = f => JSON.parse(fs.readFileSync(path.join(web, "data", f), "utf8"));

export const Matcher = require(path.join(web, "match.js"));
export const atlasFactory = require(path.join(web, "atlas.js"));
// a fresh Atlas over the real data files (each call has its own cache)
export const realAtlas = () => atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(web, url), "utf8")), Matcher });
