import fs from 'node:fs';

const uiPath='src/app/components/TournalOpsWorkspace.tsx';
let ui=fs.readFileSync(uiPath,'utf8');
ui=ui.replace('import { Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronRight, ClipboardCheck, Headphones, LayoutDashboard, Plus, RefreshCw, Search, Settings, ShieldCheck, Store, Users, X } from "lucide-react";', 'import { Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronRight, ClipboardCheck, Headphones, LayoutDashboard, LogOut, Plus, RefreshCw, Search, Settings, ShieldCheck, Store, Users, X } from "lucide-react";');
ui=ui.replace(
  'export function TournalOpsWorkspace({boutiques,users,onOpenBoutique,onSystem,canSystemAdmin=true,canEnterBoutique=true,opsRole}:{boutiques:BoutiqueLike[];users:UserLike[];onOpenBoutique:(id:string)=>void;onSystem:()=>void;canSystemAdmin?:boolean;canEnterBoutique?:boolean;opsRole?:string}) {',
  'export function TournalOpsWorkspace({boutiques,users,onOpenBoutique,onSystem,onLogout,canSystemAdmin=true,canEnterBoutique=true,opsRole}:{boutiques:BoutiqueLike[];users:UserLike[];onOpenBoutique:(id:string)=>void;onSystem:()=>void;onLogout:()=>void;canSystemAdmin?:boolean;canEnterBoutique?:boolean;opsRole?:string}) {'
);
ui=ui.replace(
  'const [taskTitle,setTaskTitle]=useState(""); const [taskBoutique,setTaskBoutique]=useState(""); const [taskTeam,setTaskTeam]=useState<"sales"|"service"|"support"|"success"|"management">("service"); const [taskPriority,setTaskPriority]=useState<OpsPriority>("normal"); const [taskDue,setTaskDue]=useState("");',
  'const [taskTitle,setTaskTitle]=useState(""); const [taskBoutique,setTaskBoutique]=useState(""); const [taskTeam,setTaskTeam]=useState<"sales"|"service"|"support"|"success"|"management">("service"); const [taskPriority,setTaskPriority]=useState<OpsPriority>("normal"); const [taskDue,setTaskDue]=useState(""); const [taskAssignee,setTaskAssignee]=useState("");'
);
ui=ui.replace(
  'const [ticketSubject,setTicketSubject]=useState(""); const [ticketBoutique,setTicketBoutique]=useState(""); const [ticketPriority,setTicketPriority]=useState<OpsPriority>("normal"); const [ticketRequester,setTicketRequester]=useState(""); const [ticketPhone,setTicketPhone]=useState("");',
  'const [ticketSubject,setTicketSubject]=useState(""); const [ticketBoutique,setTicketBoutique]=useState(""); const [ticketPriority,setTicketPriority]=useState<OpsPriority>("normal"); const [ticketRequester,setTicketRequester]=useState(""); const [ticketPhone,setTicketPhone]=useState(""); const [ticketAssignee,setTicketAssignee]=useState("");'
);
ui=ui.replace(
  'const activeTickets=(workspace?.tickets??[]).filter(t=>![\'resolved\',\'closed\'].includes(t.status)).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||b.id-a.id);',
  'const activeTickets=(workspace?.tickets??[]).filter(t=>![\'resolved\',\'closed\'].includes(t.status)).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||b.id-a.id);\n  const opsUsers=users.filter(user=>workspace?.staff.some(profile=>profile.user_id===user.id&&profile.active));\n  const userName=(id:string|null)=>id?users.find(user=>user.id===id)?.nom??"Non assigné":"Non assigné";'
);
ui=ui.replace(
  'dueAt:taskDue?new Date(taskDue).toISOString():null});setWorkspace',
  'dueAt:taskDue?new Date(taskDue).toISOString():null,assigneeId:taskAssignee||null});setWorkspace'
);
ui=ui.replace(
  'setTaskTitle("");setTaskBoutique("");setTaskDue("");setTaskModal(false);',
  'setTaskTitle("");setTaskBoutique("");setTaskDue("");setTaskAssignee("");setTaskModal(false);'
);
ui=ui.replace(
  'requesterPhone:ticketPhone});setWorkspace',
  'requesterPhone:ticketPhone,assigneeId:ticketAssignee||null});setWorkspace'
);
ui=ui.replace(
  'setTicketRequester("");setTicketPhone("");setTicketModal(false);',
  'setTicketRequester("");setTicketPhone("");setTicketAssignee("");setTicketModal(false);'
);
const badge='<span className="hidden sm:flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-bold"><ShieldCheck size={13}/> {canSystemAdmin?"SuperAdmin":opsRole?`Ops · ${opsRole}`:"Ops"}</span>';
if(ui.includes(badge)) ui=ui.replace(badge,badge+'<button onClick={onLogout} title="Déconnexion" className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><LogOut size={15}/></button>');
else if(!ui.includes('title="Déconnexion"')) throw new Error('header badge anchor not found');
ui=ui.replace(
  '<p className="text-xs text-slate-500">{teamLabel[t.team]} · {rows.find(b=>b.id===t.boutique_id)?.nom??"Global"} · {t.due_at?fmtDate(t.due_at):"sans échéance"}</p>',
  '<p className="text-xs text-slate-500">{teamLabel[t.team]} · {rows.find(b=>b.id===t.boutique_id)?.nom??"Global"} · {userName(t.assignee_id)} · {t.due_at?fmtDate(t.due_at):"sans échéance"}</p>'
);
ui=ui.replace(
  '<p className="text-xs text-slate-500">{rows.find(b=>b.id===t.boutique_id)?.nom??t.boutique_id} · {priorityLabel[t.priority]} · {fmtDate(t.created_at)}</p>',
  '<p className="text-xs text-slate-500">{rows.find(b=>b.id===t.boutique_id)?.nom??t.boutique_id} · {priorityLabel[t.priority]} · {userName(t.assignee_id)} · {fmtDate(t.created_at)}</p>'
);
const taskDate='<input type="datetime-local" value={taskDue} onChange={e=>setTaskDue(e.target.value)} className={input}/>';
if(ui.includes(taskDate)&&!ui.includes('value={taskAssignee}')) ui=ui.replace(taskDate,taskDate+'<select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)} className={input}><option value="">Non assignée</option>{opsUsers.map(user=><option key={user.id} value={user.id}>{user.nom}</option>)}</select>');
const ticketPhone='<input value={ticketPhone} onChange={e=>setTicketPhone(e.target.value)} placeholder="Téléphone" className={input}/>';
if(ui.includes(ticketPhone)&&!ui.includes('value={ticketAssignee}')) ui=ui.replace(ticketPhone,ticketPhone+'<select value={ticketAssignee} onChange={e=>setTicketAssignee(e.target.value)} className={input}><option value="">Non assigné</option>{opsUsers.map(user=><option key={user.id} value={user.id}>{user.nom}</option>)}</select>');
fs.writeFileSync(uiPath,ui);

const appPath='src/app/App.tsx';
let app=fs.readFileSync(appPath,'utf8');
const systemLine='    onSystem={()=>{ if (canSystemAdmin) setShowSystemAdmin(true); }}';
if(app.includes(systemLine)&&!app.includes('    onLogout={props.onLogout}')) app=app.replace(systemLine,systemLine+'\n    onLogout={props.onLogout}');
else if(!app.includes('onLogout={props.onLogout}')) throw new Error('TournalOps wrapper system anchor not found');
fs.writeFileSync(appPath,app);
console.log('Ops assignments and logout applied');
