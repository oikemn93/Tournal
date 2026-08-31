import fs from 'node:fs';

const path='src/app/App.tsx';
let source=fs.readFileSync(path,'utf8');
const old=`        setTimeout(() => { void Promise.all([loadOpsShell(), loadGroupes<Groupe[]>()])\n          .then(([shell, groups]) => {\n            const shellUsers = (shell.users as unknown as PlatformUser[]).map(item => item.id===opsUser.id ? { ...item, opsRole:opsProfile?.role } : item);\n            setBoutiques(shell.boutiques as unknown as Boutique[]);\n            setPlatformUsers(shellUsers);\n            if (groups?.length) setGroupes(groups);\n            void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));\n          }).catch(()=>undefined); }, 0);`;
const replacement=`        setTimeout(() => {\n          void loadOpsShell().then(shell => {\n            const shellUsers = (shell.users as unknown as PlatformUser[]).map(item => item.id===opsUser.id ? { ...item, opsRole:opsProfile?.role } : item);\n            setBoutiques(shell.boutiques as unknown as Boutique[]);\n            setPlatformUsers(shellUsers);\n            void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));\n          }).catch(error => {\n            setBackendOk(false);\n            toast.error("Tournal Ops indisponible : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });\n          });\n          if (user.isSuperAdmin) void loadGroupes<Groupe[]>().then(groups => { if (groups?.length) setGroupes(groups); }).catch(()=>undefined);\n        }, 0);`;
if(!source.includes(old)) throw new Error('Ops shell loading anchor not found');
fs.writeFileSync(path,source.replace(old,replacement,1));
console.log('Ops shell loading hardened');
