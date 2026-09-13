import fs from "node:fs";
const path="src/app/App.tsx";
let s=fs.readFileSync(path,"utf8");
const before="const settings = stored ?? { lockMinutes:10, sessionMinutes:720, supplierPaymentTermsDays:30, clientPaymentTermsDays:30 };";
const after="const settings = stored ?? { lockMinutes:10, sessionMinutes:720, supplierPaymentTermsDays:30, clientPaymentTermsDays:30, caisseControlEnabled:false, caisseDefaultOpeningFloat:0, caisseOpeningReminderTime:null, caisseClosingReminderTime:null };";
if(!s.includes(before)) throw new Error("target missing");
s=s.replace(before,after);
fs.writeFileSync(path,s);
console.log("fixed auth settings fallback shape");
