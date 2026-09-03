import fs from "node:fs";
import path from "node:path";

const roots = ["src"];
const extensions = new Set([".tsx", ".jsx"]);
const failures = [];
let checked = 0;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.has(path.extname(entry.name)) ? [full] : [];
  });
}

for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/<input\b[^>]*\btype=["']number["'][^>]*>/gms)) {
      checked += 1;
      const tag = match[0];
      if (!/\binputMode=["']numeric["']/.test(tag)) {
        const line = text.slice(0, match.index).split("\n").length;
        failures.push(`${file}:${line} number input missing inputMode=\"numeric\"`);
      }
      if (/\binputMode=["']decimal["']/.test(tag)) {
        const line = text.slice(0, match.index).split("\n").length;
        failures.push(`${file}:${line} decimal keypad remains on a number input`);
      }
    }
  }
}

if (checked === 0) failures.push("No number inputs found; keypad guard is not exercising the UI");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`numeric-keypads: ok (${checked} number inputs)`);
