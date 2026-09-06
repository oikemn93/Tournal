import fs from 'node:fs';
import path from 'node:path';

const moves = [
  ['supabase/migrations/20260906121208_bounded_rls_read_paths.sql', '.github/audit/replay-migrations/20260906121208_bounded_rls_read_paths.sql'],
  ['supabase/migrations/20260906121437_bounded_read_json_payloads.sql', '.github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql'],
];
for (const [from, to] of moves) {
  if (!fs.existsSync(from)) throw new Error(`missing replay source ${from}`);
  if (fs.existsSync(to)) throw new Error(`replay target already exists ${to}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

const contractPath = 'scripts/test-performance-read-contract.mjs';
let contract = fs.readFileSync(contractPath, 'utf8');
contract = contract.replace(
  "supabase/migrations/20260906121208_bounded_rls_read_paths.sql",
  ".github/audit/replay-migrations/20260906121208_bounded_rls_read_paths.sql",
);
contract = contract.replace(
  "supabase/migrations/20260906121437_bounded_read_json_payloads.sql",
  ".github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql",
);
if (!contract.includes('.github/audit/replay-migrations/20260906121208_bounded_rls_read_paths.sql')) throw new Error('bounded replay path not patched');
if (!contract.includes('.github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql')) throw new Error('payload replay path not patched');
fs.writeFileSync(contractPath, contract);

const manifestPath = '.github/audit/remote-migration-manifest.txt';
let manifest = fs.readFileSync(manifestPath, 'utf8').trimEnd();
for (const line of [
  '20260906121208|bounded_rls_read_paths',
  '20260906121437|bounded_read_json_payloads',
]) {
  if (!manifest.split('\n').includes(line)) manifest += `\n${line}`;
}
fs.writeFileSync(manifestPath, manifest + '\n');

for (const temp of ['scripts/apply-replay-alignment.mjs', '.github/workflows/apply-replay-alignment.yml']) {
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
}
console.log('canonical_replay_alignment_ok');
