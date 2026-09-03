import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync('src/app/App.tsx','utf8');
assert.ok(app.includes('const canSystemAdmin = !!currentProfile?.isSuperAdmin || (!!authUserId && !opsRole);'),'SuperAdmin fallback must survive Ops-shell hydration');
assert.ok(app.includes('canEnterBoutique={canSystemAdmin}'),'Only system admin may directly enter a boutique from Ops');
assert.ok(app.includes('onOpenBoutique={(boutiqueId)=>{ if (!canSystemAdmin) return;'),'Direct Ops boutique entry must remain guarded');
assert.ok(!app.includes('canEnterBoutique={canSystemAdmin || Boolean(opsRole)}'),'Ops roles must not gain direct boutique entry');
console.log('ops_boutique_entry_contract_ok');
