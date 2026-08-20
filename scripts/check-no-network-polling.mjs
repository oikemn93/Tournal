import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const NETWORK_MARKERS = [
  /\bfetch\s*\(/,
  /\bdataRequest(?:All)?\s*\(/,
  /\bauthRequest\s*\(/,
  /\badminProvision\s*\(/,
  /\bgetData\s*\(/,
  /\bsaveData\s*\(/,
  /\bpullRemote\s*\(/,
  /\b(?:supabase|realtimeClient)\b/,
  /\.(?:from|rpc|functions\.invoke)\s*\(/,
];

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function matchingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const violations = [];
for (const file of filesUnder(ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const re = /\b(?:window\.)?setInterval\s*\(/g;
  let match;
  while ((match = re.exec(source))) {
    const open = source.indexOf("(", match.index);
    const close = matchingParen(source, open);
    if (close < 0) continue;
    const call = source.slice(match.index, close + 1);
    if (!NETWORK_MARKERS.some(marker => marker.test(call))) continue;
    const line = source.slice(0, match.index).split("\n").length;
    violations.push(`${path.relative(process.cwd(), file)}:${line}`);
  }
}

if (violations.length) {
  console.error("Fixed-interval network polling is forbidden. Use Supabase Realtime/event-driven refresh instead:");
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}

console.log("No fixed-interval network polling detected (UI-only setInterval calls are allowed).\n");
