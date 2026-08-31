import fs from 'node:fs';

const opsPath='src/lib/ops.ts';
let ops=fs.readFileSync(opsPath,'utf8');
const marker='export async function loadOpsWorkspace():Promise<OpsWorkspace> {';
const additions=`export type MyOpsProfile = { user_id:string; role:"sales"|"service"|"support"|"manager"; active:boolean };\nexport type OpsShell = { boutiques:Array<Record<string,unknown>>; users:Array<Record<string,unknown>> };\n\nexport async function loadMyOpsStaffProfile():Promise<MyOpsProfile|null> {\n  return opsDataRequest<MyOpsProfile|null>("rpc/get_my_ops_profile",{method:"POST",body:JSON.stringify({})});\n}\n\nexport async function loadOpsShell():Promise<OpsShell> {\n  return opsDataRequest<OpsShell>("rpc/get_ops_shell",{method:"POST",body:JSON.stringify({})});\n}\n\n`;
if(!ops.includes('loadMyOpsStaffProfile')) {
  if(!ops.includes(marker)) throw new Error('ops workspace marker not found');
  ops=ops.replace(marker,additions+marker);
}
fs.writeFileSync(opsPath,ops);

const uiPath='src/app/components/TournalOpsWorkspace.tsx';
let ui=fs.readFileSync(uiPath,'utf8');
ui=ui.replace(
  'export function TournalOpsWorkspace({boutiques,users,onOpenBoutique,onSystem}:{boutiques:BoutiqueLike[];users:UserLike[];onOpenBoutique:(id:string)=>void;onSystem:()=>void}) {',
  'export function TournalOpsWorkspace({boutiques,users,onOpenBoutique,onSystem,canSystemAdmin=true,canEnterBoutique=true,opsRole}:{boutiques:BoutiqueLike[];users:UserLike[];onOpenBoutique:(id:string)=>void;onSystem:()=>void;canSystemAdmin?:boolean;canEnterBoutique?:boolean;opsRole?:string}) {'
);
ui=ui.replace(
  '<button onClick={()=>onOpenBoutique(selected.id)} className="rounded-xl bg-slate-950 text-white px-3 py-2 text-xs font-black">Ouvrir boutique</button>',
  '{canEnterBoutique&&<button onClick={()=>onOpenBoutique(selected.id)} className="rounded-xl bg-slate-950 text-white px-3 py-2 text-xs font-black">Ouvrir boutique</button>}'
);
ui=ui.replace(
  '<span className="hidden sm:flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-bold"><ShieldCheck size={13}/> SuperAdmin</span>',
  '<span className="hidden sm:flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-bold"><ShieldCheck size={13}/> {canSystemAdmin?"SuperAdmin":opsRole?`Ops · ${opsRole}`:"Ops"}</span>'
);
ui=ui.replace(
  '{NAV.map(([id,label,Icon])=><button key={id}',
  '{NAV.filter(([id])=>id!=="system"||canSystemAdmin).map(([id,label,Icon])=><button key={id}'
);
const teamSelect='<select value={profile?.role??""} onChange={async e=>{if(!e.target.value)return;const saved=await upsertOpsStaffProfile(u.id,e.target.value as OpsStaffProfile[\'role\']);setWorkspace(w=>w?{...w,staff:[...w.staff.filter(s=>s.user_id!==saved.user_id),saved]}:w)}} className="rounded-lg border px-2 py-1.5 text-xs"><option value="">Aucun rôle Ops</option><option value="sales">Sales</option><option value="service">Service</option><option value="support">Support</option><option value="manager">Manager</option></select>';
const teamReplacement='{canSystemAdmin?<select value={profile?.role??""} onChange={async e=>{if(!e.target.value)return;const saved=await upsertOpsStaffProfile(u.id,e.target.value as OpsStaffProfile[\'role\']);setWorkspace(w=>w?{...w,staff:[...w.staff.filter(s=>s.user_id!==saved.user_id),saved]}:w)}} className="rounded-lg border px-2 py-1.5 text-xs"><option value="">Aucun rôle Ops</option><option value="sales">Sales</option><option value="service">Service</option><option value="support">Support</option><option value="manager">Manager</option></select>:<span className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-600">{profile?.role?teamLabel[profile.role]??profile.role:"—"}</span>}' ;
if(ui.includes(teamSelect)) ui=ui.replace(teamSelect,teamReplacement);
else if(!ui.includes('canSystemAdmin?<select value={profile?.role')) throw new Error('team role select anchor not found');
ui=ui.replace(
  '{view==="system"&&<section',
  '{view==="system"&&canSystemAdmin&&<section'
);
fs.writeFileSync(uiPath,ui);

const appPath='src/app/App.tsx';
let app=fs.readFileSync(appPath,'utf8');
const importAnchor='import { TournalOpsWorkspace as TournalOps } from "./components/TournalOpsWorkspace";';
const opsImport='import { loadMyOpsStaffProfile, loadOpsShell } from "../lib/ops";';
if(!app.includes(opsImport)) {
  if(!app.includes(importAnchor)) throw new Error('Tournal Ops import anchor not found');
  app=app.replace(importAnchor,importAnchor+'\n'+opsImport);
}
const wrapperOld=`function SuperAdminScreen(props: React.ComponentProps<typeof LegacySuperAdminScreen>) {\n  const [showSystemAdmin, setShowSystemAdmin] = useState(false);\n  if (showSystemAdmin) {\n    return <div className="relative">\n      <button type="button" onClick={()=>setShowSystemAdmin(false)} className="fixed right-3 top-3 z-[100] rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-lg">← Tournal Ops</button>\n      <LegacySuperAdminScreen {...props}/>\n    </div>;\n  }\n  return <TournalOps\n    boutiques={props.boutiques}\n    users={props.platformUsers}\n    onOpenBoutique={(boutiqueId)=>{ const boutique = props.boutiques.find(item=>item.id===boutiqueId); if (boutique) props.onEnterBoutique(boutique); }}\n    onSystem={()=>setShowSystemAdmin(true)}\n  />;\n}`;
const wrapperNew=`function SuperAdminScreen(props: React.ComponentProps<typeof LegacySuperAdminScreen>) {\n  const [showSystemAdmin, setShowSystemAdmin] = useState(false);\n  const authUserId = getCurrentAuthUser()?.id;\n  const currentProfile = props.platformUsers.find(user=>user.id===authUserId);\n  const canSystemAdmin = !!currentProfile?.isSuperAdmin;\n  const opsRole = (currentProfile as PlatformUser & { opsRole?:string } | undefined)?.opsRole;\n  if (showSystemAdmin && canSystemAdmin) {\n    return <div className="relative">\n      <button type="button" onClick={()=>setShowSystemAdmin(false)} className="fixed right-3 top-3 z-[100] rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-lg">← Tournal Ops</button>\n      <LegacySuperAdminScreen {...props}/>\n    </div>;\n  }\n  return <TournalOps\n    boutiques={props.boutiques}\n    users={props.platformUsers}\n    canSystemAdmin={canSystemAdmin}\n    canEnterBoutique={canSystemAdmin}\n    opsRole={opsRole}\n    onOpenBoutique={(boutiqueId)=>{ if (!canSystemAdmin) return; const boutique = props.boutiques.find(item=>item.id===boutiqueId); if (boutique) props.onEnterBoutique(boutique); }}\n    onSystem={()=>{ if (canSystemAdmin) setShowSystemAdmin(true); }}\n  />;\n}`;
if(app.includes(wrapperOld)) app=app.replace(wrapperOld,wrapperNew);
else if(!app.includes('const canSystemAdmin = !!currentProfile?.isSuperAdmin;')) throw new Error('SuperAdminScreen wrapper anchor not found');

const authOld=`      // The global admin shell needs account metadata, never all boutique business data.\n      if (user.isSuperAdmin) {\n        setScreen("superadmin");\n        setTimeout(() => { void Promise.all([\n          loadPlatformUsers<PlatformUser[]>(), loadGroupes<Groupe[]>(),\n        ]).then(([users, groups]) => {\n          if (users?.length) setPlatformUsers(users);\n          if (groups?.length) setGroupes(groups);\n          void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));\n        }).catch(()=>undefined); }, 0);\n        return;\n      }`;
const authNew=`      // Tournal Ops is the internal work hub. SuperAdmins and explicitly\n      // authorised Ops staff enter the same lightweight shell; only SuperAdmins\n      // can cross the boundary into technical administration or impersonate a shop.\n      const opsProfile = user.isSuperAdmin ? null : await loadMyOpsStaffProfile().catch(() => null);\n      if (user.isSuperAdmin || opsProfile?.active) {\n        const opsUser = opsProfile ? ({ ...user, opsRole:opsProfile.role } as PlatformUser & { opsRole:string }) : user;\n        setCurrentUser(opsUser);\n        setPlatformUsers([opsUser]);\n        setScreen("superadmin");\n        setTimeout(() => { void Promise.all([loadOpsShell(), loadGroupes<Groupe[]>()])\n          .then(([shell, groups]) => {\n            const shellUsers = (shell.users as unknown as PlatformUser[]).map(item => item.id===opsUser.id ? { ...item, opsRole:opsProfile?.role } : item);\n            setBoutiques(shell.boutiques as unknown as Boutique[]);\n            setPlatformUsers(shellUsers);\n            if (groups?.length) setGroupes(groups);\n            void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));\n          }).catch(()=>undefined); }, 0);\n        return;\n      }`;
if(app.includes(authOld)) app=app.replace(authOld,authNew);
else if(!app.includes('const opsProfile = user.isSuperAdmin ? null : await loadMyOpsStaffProfile()')) throw new Error('authenticated flow anchor not found');
fs.writeFileSync(appPath,app);
console.log('Secure Ops staff routing applied');
