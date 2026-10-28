import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) throw new Error("Usage: node scripts/bundle-save-worker.mjs /absolute/path/to/worker/index.js");
const renderer = await readFile(resolve(project, "site-renderer.mjs"), "utf8");
const worker = (await readFile(resolve(project, "server/save-worker.mjs"), "utf8")).replace(/^import[^\n]+\n/, "");
await mkdir(dirname(resolve(target)), { recursive: true });
await writeFile(resolve(target), `${renderer}\n${worker}`);
console.log("Bundled shared renderer and save service");
