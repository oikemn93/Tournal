# Triggered after workflow installation
from pathlib import Path

# API additions
api_path=Path('src/lib/api.ts')
api=api_path.read_text()
old='''export async function resetUserPassword(userId: string, password: string) {
  return adminProvision<{ ok: true }>("reset_password", { userId, password });
}
'''
new=old+'''\nexport async function updateAdminUser(params:{userId:string;fullName:string;phone:string}) {
  return adminProvision<{ok:true}>("update_user", params);
}

export async function setAdminUserSuspended(params:{userId:string;suspended:boolean;reason?:string}) {
  return adminProvision<{ok:true;isSuspended:boolean}>("set_user_suspended", params);
}

export async function deleteAdminUser(userId:string) {
  return adminProvision<{ok:true;transferredBoutiques:string[]}>("delete_user", {userId});
}

export async function getAdminUserDebug(userId:string) {
  return adminProvision<{
    user:{id:string;nom:string;phone:string;isSuspended:boolean;suspensionReason?:string|null};
    auth:{createdAt?:string|null;lastSignInAt?:string|null;bannedUntil?:string|null;email?:string|null};
    assignments:Array<{boutique_id:string;role:string;droits?:Record<string,boolean>;boutiques?:{nom?:string;ville?:string}|null}>;
  }>("get_user_debug", {userId});
}
'''
if old not in api: raise SystemExit('api reset anchor missing')
api=api.replace(old,new,1)
old='''dataRequest<Array<any>>("platform_users?select=id,phone,nom,initials,color,is_super_admin,group_id,is_compte_mere,must_change_password"),'''
new='''dataRequest<Array<any>>("platform_users?select=id,phone,nom,initials,color,is_super_admin,is_suspended,suspension_reason,suspended_at,group_id,is_compte_mere,must_change_password"),'''
if old not in api: raise SystemExit('platform users projection anchor missing')
api=api.replace(old,new,1)
old='''      isSuperAdmin: user.is_super_admin,
      groupeId: user.group_id ?? undefined,'''
new='''      isSuperAdmin: user.is_super_admin,
      isSuspended: user.is_suspended === true,
      suspensionReason: user.suspension_reason ?? undefined,
      suspendedAt: user.suspended_at ?? undefined,
      groupeId: user.group_id ?? undefined,'''
if old not in api: raise SystemExit('platform users mapping anchor missing')
api=api.replace(old,new,1)
api_path.write_text(api)

# App integration
app_path=Path('src/app/App.tsx')
app=app_path.read_text()
old='''import { TransfersView as RelationalTransfersView } from "./screens/TransfersView";'''
new=old+'\nimport { SuperAdminUserActions } from "./components/SuperAdminUserActions";'
if old not in app: raise SystemExit('App import anchor missing')
app=app.replace(old,new,1)
old='''  groupeId?: string; isCompteMere?: boolean; mustChangePassword?: boolean;
};'''
new='''  groupeId?: string; isCompteMere?: boolean; mustChangePassword?: boolean;
  isSuspended?: boolean; suspensionReason?: string; suspendedAt?: string;
};'''
if old not in app: raise SystemExit('PlatformUser type anchor missing')
app=app.replace(old,new,1)
old='''            setCurrentUser(u);
            if (u.mustChangePassword) { setScreen("password-change"); return; }'''
new='''            setCurrentUser(u);
            if (u.isSuspended) {
              await signOutFromSupabase(); clearSession(); setCurrentUser(null); setScreen("login");
              toast.error("Compte suspendu — contactez l’administrateur Tournal"); return;
            }
            if (u.mustChangePassword) { setScreen("password-change"); return; }'''
if old not in app: raise SystemExit('bootstrap suspended anchor missing')
app=app.replace(old,new,1)
old='''    setCurrentUser(freshUser);
    if (freshUser.isSuperAdmin) { saveSession(freshUser.id, null, null); setScreen("superadmin"); return; }'''
new='''    setCurrentUser(freshUser);
    if (freshUser.isSuspended) {
      void signOutFromSupabase(); clearSession(); setCurrentUser(null); setScreen("login");
      toast.error("Compte suspendu — contactez l’administrateur Tournal"); return;
    }
    if (freshUser.isSuperAdmin) { saveSession(freshUser.id, null, null); setScreen("superadmin"); return; }'''
if old not in app: raise SystemExit('handleLogin suspended anchor missing')
app=app.replace(old,new,1)
old='''                        {isOwner&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.role.bg, color:SEM.role.text }}>Propriétaire</span>}
                        {u.isCompteMere&&'''
new='''                        {isOwner&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.role.bg, color:SEM.role.text }}>Propriétaire</span>}
                        {u.isSuspended&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.danger.bg, color:SEM.danger.text }}>Suspendu</span>}
                        {u.isCompteMere&&'''
if old not in app: raise SystemExit('suspended badge anchor missing')
app=app.replace(old,new,1)
old='''                    <button onClick={()=>{setResetTarget(u);setNewPwd("");setResetDone(false);}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{ background:"#C9A22722", color:"#C9A227" }}>
                      <RefreshCw size={13}/> MDP
                    </button>
                  </div>'''
new='''                    <button onClick={()=>{setResetTarget(u);setNewPwd("");setResetDone(false);}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{ background:"#C9A22722", color:"#C9A227" }}>
                      <RefreshCw size={13}/> MDP
                    </button>
                    <SuperAdminUserActions user={u} boutiques={boutiques} onChanged={()=>window.location.reload()}/>
                  </div>'''
if old not in app: raise SystemExit('user actions anchor missing')
app=app.replace(old,new,1)
app_path.write_text(app)
print('superadmin user controls patched')
