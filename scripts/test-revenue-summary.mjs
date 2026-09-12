import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const periodSource = fs.readFileSync('src/app/utils/reportingPeriod.ts', 'utf8');
const { reportingBounds, withinReportingBounds } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(periodSource)).toString('base64')}`);
const now = new Date('2026-09-12T13:00:00Z');
assert.deepEqual(reportingBounds('jour', '', '', now), { from:'2026-09-12T00:00:00.000Z', to:'2026-09-13T00:00:00.000Z' });
assert.equal(reportingBounds('semaine', '', '', now).from, '2026-09-06T00:00:00.000Z');
assert.equal(reportingBounds('mois', '', '', now).from, '2026-09-01T00:00:00.000Z');
assert.equal(reportingBounds('custom', '2026-09-12', '2026-09-12', now).to, '2026-09-13T00:00:00.000Z');
assert.equal(reportingBounds('custom', '2026-09-13', '2026-09-12', now), null);
assert.equal(reportingBounds('custom', '2026-02-30', '2026-03-01', now), null);
assert.equal(withinReportingBounds('2026-09-12T23:59:59.999Z', reportingBounds('jour', '', '', now)), true);
assert.equal(withinReportingBounds('2026-09-13T00:00:00Z', reportingBounds('jour', '', '', now)), false);
for (const tz of ['Europe/Paris', 'Africa/Dakar', 'America/New_York']) {
  process.env.TZ = tz;
  assert.equal(reportingBounds('jour', '', '', now).from, '2026-09-12T00:00:00.000Z');
}

// Real PostgreSQL execution of the production migration in an isolated database.
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function private.auth_has_read_permission(b text,p text) returns boolean language sql stable as $$
    select b='shop' and p=current_setting('test.permission',true)
  $$;
  create table invoices(id text,boutique_id text,invoice_date timestamptz,montant numeric,status text,type text,return_of_invoice_id text,acompte numeric default 0);
  create table invoice_payments(id bigint,boutique_id text,invoice_id text,paid_at timestamptz,amount numeric,payment_method text);
  create table stock_transfers(from_boutique_id text,invoice_id text,relationship_type text);
  create table client_credit_refunds(boutique_id text,refunded_at timestamptz,amount numeric,payment_method text);
  insert into invoices(id,boutique_id,invoice_date,montant,status,type) values
    ('old','shop','2026-08-31',1000,'payée','vente'),
    ('return','shop','2026-09-12',70,'retour','Retour'),
    ('internal','shop','2026-09-12',200000,'payée','vente'),
    ('internal-type','shop','2026-09-12',90000,'payée','Transfert interne'),
    ('commercial','shop','2026-09-09',600,'payée','vente'),
    ('cancelled','shop','2026-09-12',500,'annulée','vente'),
    ('credit','shop','2026-09-12',70,'payée','vente'),
    ('boundary','shop','2026-09-12',20,'payée','vente'),
    ('no-ledger','shop','2026-09-12',999,'payée','vente'),
    ('old','other-shop','2026-09-12',99999,'payée','vente');
  update invoices set acompte=999 where id='no-ledger';
  insert into stock_transfers values ('shop','internal','same_owner'),('shop','commercial','commercial');
  insert into invoice_payments values
    (1,'shop','old','2026-09-05',100,'Espèces'),
    (2,'shop','old','2026-09-06',200,'Espèces'),
    (3,'shop','old','2026-09-12',300,'Wave'),
    (4,'shop','old','2026-09-13',400,'Espèces'),
    (5,'shop','return','2026-09-12',70,'Espèces'),
    (6,'shop','internal','2026-09-12',200000,'Espèces'),
    (7,'shop','internal-type','2026-09-12',90000,'Espèces'),
    (8,'shop','commercial','2026-09-12',80,'Wave'),
    (9,'shop','commercial','2026-09-09',120,'Wave'),
    (10,'shop','cancelled','2026-09-12',500,'Espèces'),
    (11,'shop','credit','2026-09-12',70,'Avoir client'),
    (12,'shop','boundary','2026-09-12T00:30:00+02',15,'Espèces'),
    (13,'shop','boundary','2026-09-12T23:59:59.999Z',5,'Espèces'),
    (14,'other-shop','old','2026-09-12',99999,'Espèces');
  insert into client_credit_refunds values ('shop','2026-09-12',20,'Espèces');
`);
const migration = fs.readFileSync('supabase/migrations/20260912143522_unify_revenue_summary.sql','utf8');
await db.exec(migration);
await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';`);
async function read(permission, bounds, boutique='shop') {
  await db.query(`select set_config('test.permission',$1,false)`, [permission]);
  return (await db.query('select public.get_revenue_summary($1,$2,$3) as result',[boutique,bounds.from,bounds.to])).rows[0].result;
}
for (const [period, expected] of [['jour',295],['semaine',630],['mois',730]]) {
  const bounds=reportingBounds(period,'','',now);
  const accueil=await read('dashboard',bounds);
  const rapport=await read('compta',bounds);
  assert.deepEqual(accueil,rapport,`${period}: both screen permissions must return identical results`);
  assert.equal(accueil.collected,expected,`${period}: real payment dates, returns, commercial B2B, internal transfers, credits and refunds`);
  assert.equal(accueil.payment_methods.reduce((s,m)=>s+m.total,0),expected);
  assert.equal(accueil.paid_sales_count,3);
  console.log(`${period}: Accueil = Rapport = ${expected}`);
}
// Data updates are read afresh, without bootstrap totals or stale caching.
await db.exec(`insert into invoice_payments values (15,'shop','old','2026-09-12',25.25,'Espèces')`);
assert.equal((await read('dashboard',reportingBounds('jour','','',now))).collected,320.25);
assert.equal((await read('compta',reportingBounds('jour','','',now))).collected,320.25);
await assert.rejects(read('stock',reportingBounds('jour','','',now)), /forbidden/);
await assert.rejects(read('dashboard',reportingBounds('jour','','',now),'other-shop'), /forbidden/);
await assert.rejects(read('dashboard',{from:'2026-09-13',to:'2026-09-12'}), /invalid revenue period/);
await db.exec(`set test.uid='';`);
await assert.rejects(read('dashboard',reportingBounds('jour','','',now)), /forbidden/);

// Verify both component wiring paths cannot fall back to the old local CA.
for (const screen of ['DashboardView','RapportView']) {
  const source=fs.readFileSync(`src/app/screens/${screen}.tsx`,'utf8');
  assert.ok(source.includes('useRevenueSummary('));
  assert.ok(source.includes('revenue.summary'));
  assert.ok(!source.includes('filtPayments.reduce'));
  assert.ok(!source.includes('fmt(summary.collected)'));
  assert.ok(source.includes('from "../utils/formatting"'), 'Both screens must preserve identical currency precision');
}
await db.close();
console.log('Revenue periods, SQL fixtures, access boundaries and screen wiring: OK');
