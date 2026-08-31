import fs from 'node:fs';
const path='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(path,'utf8');
const before='  createOpsInteraction, createOpsTask, createOpsTicket, decideOpsAccessRequest, loadOpsSupportDiagnostic, loadOpsWorkspace, requestOpsBoutiqueAccess, updateOpsOnboarding,';
const after='  createOpsContact, createOpsInteraction, createOpsTask, createOpsTicket, decideOpsAccessRequest, loadOpsSupportDiagnostic, loadOpsWorkspace, requestOpsBoutiqueAccess, updateOpsAccount, updateOpsOnboarding,';
if(!s.includes('createOpsContact, createOpsInteraction')) {
  if(!s.includes(before)) throw new Error('Ops import anchor missing');
  s=s.replace(before,after);
}
fs.writeFileSync(path,s);
