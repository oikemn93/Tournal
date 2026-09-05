import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = 'dist';
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i) || html.match(/<script[^>]+src="([^"]+)"[^>]+type="module"/i);
if (!match) throw new Error('production entry script not found in dist/index.html');
const entryPath = path.join(dist, match[1].replace(/^\//, ''));
const entry = fs.readFileSync(entryPath);
const entryGzip = zlib.gzipSync(entry).byteLength;
const entryMax = 500 * 1024;
const entryGzipMax = 150 * 1024;
if (entry.byteLength > entryMax) throw new Error(`entry bundle ${entry.byteLength} exceeds ${entryMax} bytes`);
if (entryGzip > entryGzipMax) throw new Error(`entry gzip ${entryGzip} exceeds ${entryGzipMax} bytes`);

// The entry file is not the full initial payload. Vite keeps shared modules in
// statically imported chunks, which the browser must download before the app
// can start. Follow only static ESM imports here: dynamic imports belong to
// lazy screens and must not be charged to the initial-route budget.
const staticImportPattern = /\bimport(?!\s*\()(?:[^"'`;]*?\bfrom\s*)?["']([^"']+)["']/g;
const initialFiles = new Set();
function collectStaticImports(filePath) {
  const normalized = path.normalize(filePath);
  if (initialFiles.has(normalized)) return;
  initialFiles.add(normalized);

  const source = fs.readFileSync(normalized, 'utf8');
  for (const importMatch of source.matchAll(staticImportPattern)) {
    const specifier = importMatch[1];
    if (!specifier.startsWith('.')) continue;
    collectStaticImports(path.resolve(path.dirname(normalized), specifier));
  }
}
collectStaticImports(entryPath);

const initialAssets = [...initialFiles].map(filePath => {
  const content = fs.readFileSync(filePath);
  return {
    name: path.relative(dist, filePath),
    bytes: content.byteLength,
    gzip: zlib.gzipSync(content).byteLength,
  };
});
const initialBytes = initialAssets.reduce((total, asset) => total + asset.bytes, 0);
const initialGzip = initialAssets.reduce((total, asset) => total + asset.gzip, 0);
const initialMax = 800 * 1024;
const initialGzipMax = 220 * 1024;
if (initialBytes > initialMax) {
  throw new Error(`initial JS graph ${initialBytes} exceeds ${initialMax} bytes: ${JSON.stringify(initialAssets)}`);
}
if (initialGzip > initialGzipMax) {
  throw new Error(`initial JS graph gzip ${initialGzip} exceeds ${initialGzipMax} bytes: ${JSON.stringify(initialAssets)}`);
}

const assets = fs.readdirSync(path.join(dist, 'assets')).filter(name => name.endsWith('.js'));
const oversized = assets.map(name => ({ name, bytes: fs.statSync(path.join(dist,'assets',name)).size })).filter(x => x.bytes > 500 * 1024);
if (oversized.length) throw new Error(`JS chunk budget exceeded: ${JSON.stringify(oversized)}`);
console.log(`bundle_budget_ok entry=${entry.byteLength} gzip=${entryGzip} initial=${initialBytes} initial_gzip=${initialGzip} initial_chunks=${initialAssets.length} chunks=${assets.length}`);
