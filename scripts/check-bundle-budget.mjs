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

const assets = fs.readdirSync(path.join(dist, 'assets')).filter(name => name.endsWith('.js'));
const oversized = assets.map(name => ({ name, bytes: fs.statSync(path.join(dist,'assets',name)).size })).filter(x => x.bytes > 500 * 1024);
if (oversized.length) throw new Error(`JS chunk budget exceeded: ${JSON.stringify(oversized)}`);
console.log(`bundle_budget_ok entry=${entry.byteLength} gzip=${entryGzip} chunks=${assets.length}`);
