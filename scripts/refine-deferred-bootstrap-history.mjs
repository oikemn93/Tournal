import fs from 'node:fs';
const path='src/lib/api.ts';
let s=fs.readFileSync(path,'utf8');

const oldDefault=`function defaultBootstrapHistoryFrom() {\n  const date = new Date();\n  date.setUTCDate(date.getUTCDate() - BOOTSTRAP_HISTORY_DAYS);\n  return date.toISOString().slice(0, 10);\n}`;
const newDefault=`function bootstrapHistoryFromDays(days: number) {\n  const date = new Date();\n  date.setUTCDate(date.getUTCDate() - days);\n  return date.toISOString().slice(0, 10);\n}\nfunction defaultBootstrapHistoryFrom() {\n  return bootstrapHistoryFromDays(BOOTSTRAP_HISTORY_DAYS);\n}`;
if(!s.includes(oldDefault)) throw new Error('default history helper anchor changed');
s=s.replace(oldDefault,newDefault);

const oldHistory=`    const historyFrom = options.historyFrom ?? defaultBootstrapHistoryFrom();\n    const historyTo = options.historyTo;\n    const historyFromFilter = encodeURIComponent(historyFrom);`;
const newHistory=`    const historyFrom = options.historyFrom ?? defaultBootstrapHistoryFrom();\n    const historyTo = options.historyTo;\n    const historyFromFilter = encodeURIComponent(historyFrom);\n    // Small ledgers keep the previous 30-day initial behavior. Only the heavy\n    // invoice/stock/payment series use the 7-day critical-path window.\n    const secondaryHistoryFrom = options.historyFrom ?? bootstrapHistoryFromDays(FULL_BOOTSTRAP_HISTORY_DAYS);\n    const secondaryHistoryFromFilter = encodeURIComponent(secondaryHistoryFrom);`;
if(!s.includes(oldHistory)) throw new Error('history variables anchor changed');
s=s.replace(oldHistory,newHistory);

const oldPayment='const paymentWindow = `${historyFrom ? `&paid_at=gte.${historyFromFilter}` : ""}${historyTo ? `&paid_at=lt.${encodeURIComponent(historyTo)}` : ""}`;';
const newPayment='const paymentWindow = `${historyFrom ? `&paid_at=gte.${historyFromFilter}` : ""}${historyTo && !options.historyOnly ? `&paid_at=lt.${encodeURIComponent(historyTo)}` : ""}`;';
if(!s.includes(oldPayment)) throw new Error('payment window anchor changed');
s=s.replace(oldPayment,newPayment);

s=s.replace('const chargeWindow = `&or=(charge_date.gte.${historyFromFilter},status.neq.paid)`;', 'const chargeWindow = `&or=(charge_date.gte.${secondaryHistoryFromFilter},status.neq.paid)`;');
s=s.replace('const caisseWindow = `&or=(opened_at.gte.${historyFromFilter},closed_at.is.null)`;', 'const caisseWindow = `&or=(opened_at.gte.${secondaryHistoryFromFilter},closed_at.is.null)`;');
s=s.replace('`client_credit_refunds?select=*${scoped()}&refunded_at=gte.${historyFromFilter}&order=refunded_at.desc,id.desc`', '`client_credit_refunds?select=*${scoped()}&refunded_at=gte.${secondaryHistoryFromFilter}&order=refunded_at.desc,id.desc`');

fs.writeFileSync(path,s);
