import fs from "node:fs";

const app = fs.readFileSync("src/app/App.tsx", "utf8");
const invoice = fs.readFileSync("src/app/utils/invoice.ts", "utf8");

const forbidden = [
  ["setEncaissAmt(", "invoice collection must use the canonical split-payment state"],
  ["techLog(", "deferred history failures must not call an undefined logger"],
];
for (const [token, message] of forbidden) {
  if (app.includes(token)) throw new Error(message);
}

if (!app.includes('setEncaissSplit([{method:"Espèces",amount:String(inv.montant-inv.acompte)}])')) {
  throw new Error("quick invoice collection must initialize the canonical cash split");
}
if (!app.includes("verifyQuickPin(pinValue, boutique.id)")) {
  throw new Error("quick PIN verification must use the non-null hydrated boutique id");
}
if ((app.match(/storePDFForSMS\([\s\S]*?\)\) \?\? ""/g) ?? []).length < 2) {
  throw new Error("nullable PDF share links must keep WhatsApp and SMS fallbacks safe");
}
if (!app.includes("return () => { PA.listeners.delete(cb); };")) {
  throw new Error("legacy print-agent subscription must expose a void React cleanup");
}
if (!invoice.includes("return () => { PA.listeners.delete(cb); };")) {
  throw new Error("modular print-agent subscription must expose a void React cleanup");
}

console.log("runtime_safety_contract_ok");
