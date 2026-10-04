import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {X509Certificate} from 'node:crypto';
const source=readFileSync('src/app/utils/qzSecurity.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {configureQzSecurity,QZ_CERTIFICATE}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
assert.ok(new X509Certificate(QZ_CERTIFICATE).subject.includes('Tournal'));
function setup(sign){let cert,algorithm,callback;configureQzSecurity({security:{setCertificatePromise:fn=>fn(v=>cert=v),setSignatureAlgorithm:v=>algorithm=v,setSignaturePromise:fn=>callback=fn}},sign);assert.equal(cert,QZ_CERTIFICATE);assert.equal(algorithm,'SHA512');return msg=>new Promise(callback(msg));}
const payload='{"call":"printers.find","timestamp":123,"params":{"query":"étiquette"}}';
assert.equal(await setup(async msg=>{assert.equal(msg,payload);return 'signed-base64';})(payload),'signed-base64');
await assert.rejects(setup(async()=>{throw new Error('signing unavailable');})(payload),/signing unavailable/);
await assert.rejects(setup(async()=>'')(payload),/Signature QZ indisponible/);
await assert.rejects(setup(()=>{throw new Error('sync failure');})(payload),/sync failure/);
for(const file of ['src/app/App.tsx','src/app/utils/invoice.ts']){const s=readFileSync(file,'utf8');assert.ok(s.includes('configureQzSecurity(qz, signQZ)'));assert.ok(!s.includes('setSignaturePromise'));}
console.log('QZ security checks passed');
