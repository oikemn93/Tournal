import fs from 'node:fs';
const p='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(p,'utf8');
const needle='  const pendingAccess=(workspace?.accessRequests??[]).filter(r=>r.status==="pending");\n';
const insert=`  const pendingAccess=(workspace?.accessRequests??[]).filter(r=>r.status==="pending");
  const now=Date.now();
  const overdueTasks=activeTasks.filter(t=>t.due_at&&new Date(t.due_at).getTime()<now);
  const slaBreaches=activeTickets.filter(t=>t.sla_due_at&&new Date(t.sla_due_at).getTime()<now);
  const staleTickets=activeTickets.filter(t=>new Date(t.updated_at??t.created_at).getTime()<now-24*60*60*1000);
  const blockedOnboarding=rows.filter(b=>b.progress<100&&Boolean(b.firstSale)&&!b.onboarding?.training_done);
  const operationalAlerts=[
    ...overdueTasks.map(t=>({kind:'Tâche en retard',label:t.title,boutiqueId:t.boutique_id,priority:t.priority})),
    ...slaBreaches.map(t=>({kind:'SLA dépassé',label:t.subject,boutiqueId:t.boutique_id,priority:t.priority})),
    ...staleTickets.filter(t=>!slaBreaches.some(x=>x.id===t.id)).map(t=>({kind:'Ticket sans mouvement >24h',label:t.subject,boutiqueId:t.boutique_id,priority:t.priority})),
    ...blockedOnboarding.map(b=>({kind:'Onboarding à finaliser',label:b.nom,boutiqueId:b.id,priority:'normal' as OpsPriority})),
  ].slice(0,12);
`;
if(!s.includes(needle)) throw new Error('pendingAccess anchor missing');
s=s.replace(needle,insert);
const homeRe=/\{view===?["']home["']&&/;
const m=s.match(homeRe);
if(!m||m.index==null) throw new Error('home condition missing');
const pos=m.index+m[0].length;
const panel=`<><section className="rounded-3xl border bg-white p-5 mb-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Alertes opérationnelles</p><h2 className="text-lg font-black">À traiter maintenant</h2></div><span className={\`rounded-full px-3 py-1 text-xs font-black \${operationalAlerts.length?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'}\`}>{operationalAlerts.length||'RAS'}</span></div>{operationalAlerts.length?<div className="mt-4 divide-y">{operationalAlerts.map((a,i)=><button key={a.kind+i} onClick={()=>{if(a.boutiqueId){setSelectedId(a.boutiqueId);setView('clients')}}} className="w-full py-3 text-left flex items-center gap-3"><AlertTriangle size={16} className={a.priority==='urgent'?'text-red-500':'text-amber-500'}/><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-500">{a.kind}</p><p className="truncate text-sm font-bold">{a.label}</p></div><ChevronRight size={15} className="text-slate-300"/></button>)}</div>:<p className="mt-4 text-sm text-slate-500">Aucune alerte opérationnelle active.</p>}</section>`;
s=s.slice(0,pos)+panel+s.slice(pos);
// Close the fragment immediately before the next top-level view condition.
const next=s.indexOf('{view===',pos+panel.length);
if(next<0) throw new Error('next view condition missing');
s=s.slice(0,next)+'</>'+s.slice(next);
fs.writeFileSync(p,s);
