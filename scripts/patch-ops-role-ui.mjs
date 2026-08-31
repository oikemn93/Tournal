import fs from 'node:fs';
const path='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(path,'utf8');
const anchor='  const userName=(id:string|null)=>id?users.find(user=>user.id===id)?.nom??"Non assigné":"Non assigné";';
if(!s.includes('const canManageOnboarding=')){
  if(!s.includes(anchor)) throw new Error('userName anchor missing');
  s=s.replace(anchor,`${anchor}\n  const canManageOnboarding=canSystemAdmin||opsRole==="service"||opsRole==="manager";\n  const canManageTickets=canSystemAdmin||opsRole==="support"||opsRole==="manager";\n  const canManageTask=(task:OpsTask)=>canSystemAdmin||opsRole==="manager"||(opsRole==="sales"&&task.team==="sales")||(opsRole==="service"&&(task.team==="service"||task.team==="success"))||(opsRole==="support"&&task.team==="support");`);
}
s=s.replace('{!ob?.training_done&&<button onClick=', '{canManageOnboarding&&!ob?.training_done&&<button onClick=');
const taskButton='<button onClick={()=>void completeTask(t)} title="Terminer" className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={15}/></button>';
if(s.includes(taskButton)) s=s.replace(taskButton,`{canManageTask(t)&&${taskButton}}`);
const ticketButton='<button onClick={()=>void resolveTicket(t)} className="rounded-lg bg-emerald-50 text-emerald-700 px-2 text-[10px] font-black">Résoudre</button>';
if(s.includes(ticketButton)) s=s.replace(ticketButton,`{canManageTickets&&${ticketButton}}`);
fs.writeFileSync(path,s);
