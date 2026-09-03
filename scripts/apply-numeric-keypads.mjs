import fs from "node:fs";
import path from "node:path";

const roots = ["src"];
const extensions = new Set([".tsx", ".jsx"]);
let changedFiles = 0;
let changedInputs = 0;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.has(path.extname(entry.name)) ? [full] : [];
  });
}

for (const root of roots) {
  for (const file of walk(root)) {
    const original = fs.readFileSync(file, "utf8");
    let fileChanges = 0;
    const updated = original.replace(/<input\b[^>]*\btype=["']number["'][^>]*>/gms, (tag) => {
      let next = tag;
      if (/\binputMode=["'][^"']*["']/.test(next)) {
        next = next.replace(/\binputMode=["'][^"']*["']/, 'inputMode="numeric"');
      } else {
        next = next.replace(/\btype=["']number["']/, (typeAttr) => `${typeAttr} inputMode="numeric"`);
      }
      if (next !== tag) fileChanges += 1;
      return next;
    });
    if (updated !== original) {
      fs.writeFileSync(file, updated);
      changedFiles += 1;
      changedInputs += fileChanges;
      console.log(`${file}: ${fileChanges} numeric input(s)`);
    }
  }
}

console.log(`numeric-keypads: ${changedInputs} input(s) updated across ${changedFiles} file(s)`);
