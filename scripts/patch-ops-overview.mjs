import fs from 'node:fs';

const opsPath='src/lib/ops.ts';
let ops=fs.readFileSync(opsPath,'utf8');
const staffType='export type OpsStaffProfile = { user_id:string; role:"sales"|"service"|"support"|"manager"; active:boolean; created_at:string; updated_at:string };';
const overviewType=`export type OpsBoutiqueOverview = {\n  boutique_id:string; product_count:number; user_count:number; owner_count:number;\n  first_sale_at:string|null; last_sale_at:string|null; first_receipt_at:string|null; last_stock_activity_at:string|null;\n};`;
if(!ops.includes('export type OpsBoutiqueOverview')) ops=ops.replace(staffType,`${staffType}\n${overviewType}`);
ops=ops.replace('onboarding:OpsOnboarding[]; staff:OpsStaffProfile[];','onboarding:OpsOnboarding[]; staff:OpsStaffProfile[]; overview:OpsBoutiqueOverview[];');
ops=ops.replace('const [tasks,tickets,interactions,onboarding,staff] = await Promise.all([','const [tasks,tickets,interactions,onboarding,staff,overview] = await Promise.all([');
const staffReq='opsDataRequest<OpsStaffProfile[]>("ops_staff_profiles?select=*&order=created_at.asc&limit=200"),';
if(!ops.includes('get_ops_boutique_overview')) ops=ops.replace(staffReq,`${staffReq}\n    opsDataRequest<OpsBoutiqueOverview[]>("rpc/get_ops_boutique_overview",{method:"POST",body:JSON.stringify({})}),`);
ops=ops.replace('return { tasks,tickets,interactions,onboarding,staff };','return { tasks,tickets,interactions,onboarding,staff,overview };');
fs.writeFileSync(opsPath,ops);

const uiPath='src/app/components/TournalOpsWorkspace.tsx';
let ui=fs.readFileSync(uiPath,'utf8');
const old=`    const lastSale=(b.invoices??[]).map(i=>i.dateRaw??i.date??"").filter(Boolean).sort().at(-1)??null;\n    const firstSale=(b.invoices??[]).map(i=>i.dateRaw??i.date??"").filter(Boolean).sort().at(0)??null;\n    const receipts=(b.entries??[]).filter(e=>(e.qty??0)>0&&e.movementType==="achat");\n    const firstReceipt=receipts.map(e=>e.recordedAt??e.date??"").filter(Boolean).sort().at(0)??null;\n    const setup=(b.products?.length??0)>0;\n    const onboarding=workspace?.onboarding.find(o=>o.boutique_id===b.id);`;
const replacement=`    const overview=workspace?.overview.find(item=>item.boutique_id===b.id);\n    const lastSale=overview?.last_sale_at??(b.invoices??[]).map(i=>i.dateRaw??i.date??"").filter(Boolean).sort().at(-1)??null;\n    const firstSale=overview?.first_sale_at??(b.invoices??[]).map(i=>i.dateRaw??i.date??"").filter(Boolean).sort().at(0)??null;\n    const receipts=(b.entries??[]).filter(e=>(e.qty??0)>0&&e.movementType==="achat");\n    const firstReceipt=overview?.first_receipt_at??receipts.map(e=>e.recordedAt??e.date??"").filter(Boolean).sort().at(0)??null;\n    const setup=(overview?.product_count??b.products?.length??0)>0;\n    const onboarding=workspace?.onboarding.find(o=>o.boutique_id===b.id);`;
if(ui.includes(old)) ui=ui.replace(old,replacement);
else if(!ui.includes('const overview=workspace?.overview.find')) throw new Error('overview UI anchor not found');
ui=ui.replace('const ownerReady=members.some(m=>m.assignments?.some(a=>a.boutiqueId===b.id&&a.role==="Propriétaire"));','const ownerReady=(overview?.owner_count??0)>0||members.some(m=>m.assignments?.some(a=>a.boutiqueId===b.id&&(a.role==="Propriétaire"||a.role==="owner")));');
fs.writeFileSync(uiPath,ui);
console.log('Ops overview wired');
