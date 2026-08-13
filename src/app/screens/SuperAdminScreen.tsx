import React, { useState, useRef } from "react";
import { Search, Shield, LogOut, MapPin, ChevronRight, Edit2, Trash2, Plus, Building2, UserPlus, RefreshCw, Smartphone, Lock, Eye, EyeOff, CheckCircle, Camera, X } from "lucide-react";
import type { Boutique, PlatformUser } from "../types";
import { SEM, USER_COLORS, inputCls } from "../constants";
import { ini, resizeImage } from "../utils/formatting";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";

export function SuperAdminScreen({ boutiques, platformUsers, onEnterBoutique, onCreateBoutique, onUpdateBoutique, onDeleteBoutique, onCreateUser, onResetPassword, onResetBackend, onLogout, backendOk, saveState }: {
  boutiques: Boutique[]; platformUsers: PlatformUser[];
  onEnterBoutique: (b: Boutique) => void;
  onCreateBoutique: (nom: string, ville: string, ownerId: string, logo?: string) => void;
  onUpdateBoutique: (id: string, nom: string, ville: string) => void;
  onDeleteBoutique: (id: string) => void;
  onCreateUser: (u: Omit<PlatformUser,"id">) => void;
  onResetPassword: (uid: string, pwd: string) => void;
  onResetBackend: () => Promise<void>;
  onLogout: () => void;
  backendOk: boolean | null;
  saveState: "idle"|"saving"|"saved"|"error";
}) {
  const [tab, setTab] = useState<"boutiques"|"users">("boutiques");
  const [bSearch, setBSearch] = useState("");
  const [uSearch, setUSearch] = useState("");
  const [newB, setNewB] = useState(false);
  const [editB, setEditB] = useState<Boutique|null>(null);
  const [deleteB, setDeleteB] = useState<Boutique|null>(null);
  const [newU, setNewU] = useState(false);
  const [resetTarget, setResetTarget] = useState<PlatformUser|null>(null);
  const [bNom,setBNom]=useState(""); const [bVille,setBVille]=useState(""); const [bOwner,setBOwner]=useState(""); const [bLogo,setBLogo]=useState<string|null>(null);
  const bLogoRef = useRef<HTMLInputElement>(null);
  const [eBNom,setEBNom]=useState(""); const [eBVille,setEBVille]=useState("");
  const [uNom,setUNom]=useState(""); const [uPhone,setUPhone]=useState("+221 "); const [uPwd,setUPwd]=useState("");
  const [newPwd,setNewPwd]=useState(""); const [showP,setShowP]=useState(false); const [resetDone,setResetDone]=useState(false);

  const nonAdmin = platformUsers.filter(u=>!u.isSuperAdmin);

  const filteredBoutiques = boutiques.filter(b=>b.nom.toLowerCase().includes(bSearch.toLowerCase())||b.ville.toLowerCase().includes(bSearch.toLowerCase()));
  const filteredUsers = nonAdmin.filter(u=>u.nom.toLowerCase().includes(uSearch.toLowerCase())||u.phone.includes(uSearch));

  function submitBoutique() {
    if (!bNom.trim()||!bOwner) return;
    onCreateBoutique(bNom.trim(), bVille.trim(), bOwner, bLogo??undefined);
    setBNom(""); setBVille(""); setBOwner(""); setBLogo(null); setNewB(false);
  }
  async function handleBLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBLogo(await resizeImage(f));
  }
  function submitEditBoutique() {
    if (!editB||!eBNom.trim()) return;
    onUpdateBoutique(editB.id, eBNom.trim(), eBVille.trim());
    setEditB(null);
  }
  function submitUser() {
    if (!uNom.trim()||!uPhone.trim()||!uPwd.trim()) return;
    const color = USER_COLORS[platformUsers.length%USER_COLORS.length];
    onCreateUser({ phone:uPhone.trim(), password:uPwd, nom:uNom.trim(), initials:ini(uNom.trim()), color, isSuperAdmin:false, assignments:[] });
    setUNom(""); setUPhone("+221 "); setUPwd(""); setNewU(false);
  }
  function submitReset() {
    if (!resetTarget||newPwd.length<4) return;
    onResetPassword(resetTarget.id,newPwd); setResetDone(true);
    setTimeout(()=>{ setResetTarget(null); setNewPwd(""); setResetDone(false); setShowP(false); },1200);
  }

  return (
    <div className="bg-background text-foreground h-screen flex flex-col overflow-hidden" style={{ fontFamily:"'Inter', sans-serif" }}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div><div className="flex items-center gap-2 mb-0.5"><Shield size={14} style={{ color:"#C9A227" }}/><span className="text-xs text-muted-foreground font-semibold">Super Admin</span></div>
          <h1 className="text-2xl font-black" style={{ fontFamily:"'Nunito', sans-serif", color:"#C9A227" }}>Tournal</h1></div>
        <div className="flex items-center gap-2">
          <button onClick={onResetBackend}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: saveState==="saving"?"#fef9c3":saveState==="saved"?"#dcfce7":saveState==="error"||backendOk===false?"#fee2e2":"#f0fdf4", color: saveState==="saving"?"#854d0e":saveState==="saved"?"#166534":saveState==="error"||backendOk===false?"#991b1b":"#166534" }}>
            {saveState==="saving"?"⟳ Sync…":saveState==="saved"?"✓ Synced":saveState==="error"?"✗ Réessayer":backendOk===false?"✗ Sync":"● Backend"}
          </button>
          <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#EEE9D8" }}>
            <LogOut size={16} className="text-muted-foreground"/><span className="text-sm text-muted-foreground">Quitter</span></button>
        </div>
      </header>
      <div className="flex bg-card border-b border-border px-4 flex-shrink-0">
        {([{id:"boutiques" as const,label:`🏪 Boutiques (${boutiques.length})`},{id:"users" as const,label:`👥 Utilisateurs (${nonAdmin.length})`}]).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="px-4 py-3 text-sm font-bold relative" style={{ color:tab===t.id?"#C9A227":"#6b7280" }}>
            {t.label}{tab===t.id&&<span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background:"#C9A227" }}/>}
          </button>
        ))}
      </div>
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8" style={{ scrollbarWidth:"none" }}>
        {tab==="boutiques"&&(
          <>
            <div className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={bSearch} onChange={e=>setBSearch(e.target.value)} placeholder="Chercher un tenant…" className={inputCls+" pl-10 py-3"}/></div>
            {filteredBoutiques.map(b=>{
              const owner=platformUsers.find(u=>u.assignments.some(a=>a.boutiqueId===b.id&&a.role==="Propriétaire"));
              const uc=platformUsers.filter(u=>u.assignments.some(a=>a.boutiqueId===b.id)).length;
              return (
                <div key={b.id} className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow:`inset 3px 0 0 ${b.color}` }}>
                  <button className="w-full p-5 text-left flex items-center gap-4 active:scale-[0.98]" onClick={()=>onEnterBoutique(b)}>
                    <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black overflow-hidden" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.logo?<img src={b.logo} alt={b.nom} className="w-full h-full object-contain p-1"/>:b.initials}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black leading-tight" style={{ fontFamily:"'Nunito', sans-serif" }}>{b.nom}</p>
                      <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                      {owner&&<p className="text-xs mt-1" style={{ color:b.color }}>Propriétaire : {owner.nom}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{uc} user{uc>1?"s":""} · {b.products.length} produits</p>
                    </div>
                    <ChevronRight size={20} style={{ color:b.color }}/>
                  </button>
                  <div className="flex border-t border-border">
                    <button onClick={()=>{ setEditB(b); setEBNom(b.nom); setEBVille(b.ville); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#3b82f6" }}>
                      <Edit2 size={13}/> Modifier
                    </button>
                    <div className="w-px bg-border"/>
                    <button onClick={()=>setDeleteB(b)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#ef4444" }}>
                      <Trash2 size={13}/> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
            <button onClick={()=>setNewB(true)} className="w-full rounded-2xl p-5 border-2 border-dashed border-border flex items-center gap-4 active:scale-[0.98]">
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center"><Plus size={26} className="text-muted-foreground"/></div>
              <div className="text-left"><p className="text-base font-bold text-muted-foreground">Nouveau tenant</p><p className="text-xs text-muted-foreground mt-0.5">Assigner un propriétaire existant</p></div>
            </button>
          </>
        )}
        {tab==="users"&&(
          <>
            <div className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={uSearch} onChange={e=>setUSearch(e.target.value)} placeholder="Chercher un utilisateur…" className={inputCls+" pl-10 py-3"}/></div>
            {filteredUsers.map(u=>{
              const isOwner=u.assignments.some(a=>a.role==="Propriétaire");
              return (
                <div key={u.id} className="bg-card rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:u.color+"22", color:u.color, fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm">{u.nom}</p>
                        {isOwner&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.role.bg, color:SEM.role.text }}>Propriétaire</span>}
                      </div>
                      <div className="flex items-center gap-1.5"><Smartphone size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{u.phone}</span></div>
                    </div>
                    <button onClick={()=>{setResetTarget(u);setNewPwd("");setResetDone(false);}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{ background:"#C9A22722", color:"#C9A227" }}>
                      <RefreshCw size={13}/> MDP
                    </button>
                  </div>
                  {u.assignments.length>0&&<div className="flex flex-wrap gap-2 mt-3">{u.assignments.map((a,i)=>{const b=boutiques.find(x=>x.id===a.boutiqueId);return b?<span key={i} className="text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5" style={{ background:b.color+"22", color:b.color }}><Building2 size={11}/>{b.nom} · {a.role}</span>:null;})}</div>}
                  {u.assignments.length===0&&<p className="text-xs text-muted-foreground mt-2">Aucun tenant assigné</p>}
                </div>
              );
            })}
            <button onClick={()=>setNewU(true)} className="w-full rounded-2xl p-4 border-2 border-dashed border-border flex items-center gap-3 active:scale-[0.98]">
              <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><UserPlus size={22} className="text-muted-foreground"/></div>
              <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Créer un utilisateur</p><p className="text-xs text-muted-foreground mt-0.5">Puis l'assigner à un tenant</p></div>
            </button>
          </>
        )}
      </main>

      {/* Create boutique modal */}
      {newB&&<Modal title="Nouveau tenant" color="#C9A227" onClose={()=>{setNewB(false);setBLogo(null);}}>
        <Field label="NOM DE LA BOUTIQUE" color="#C9A227"><input value={bNom} onChange={e=>setBNom(e.target.value)} placeholder="Ex: Diallo Textiles" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitBoutique()}/></Field>
        <Field label="VILLE" color="#C9A227"><input value={bVille} onChange={e=>setBVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitBoutique()}/></Field>
        <Field label="LOGO (optionnel)" color="#C9A227">
          <input ref={bLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBLogoFile}/>
          <button type="button" onClick={()=>bLogoRef.current?.click()} className="w-full flex items-center gap-4 p-3 rounded-2xl border-2 border-dashed active:scale-[0.98]" style={{ borderColor:bLogo?"#C9A227":"rgba(0,0,0,0.12)" }}>
            {bLogo
              ? <><img src={bLogo} alt="logo" className="w-14 h-14 rounded-xl object-contain bg-white border border-border flex-shrink-0"/>
                  <div className="flex-1 text-left"><p className="text-sm font-bold" style={{color:"#C9A227"}}>Logo sélectionné</p><p className="text-xs text-muted-foreground">Cliquer pour changer</p></div>
                  <button type="button" onClick={e=>{e.stopPropagation();setBLogo(null);}} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:"#ef444415"}}><X size={14} style={{color:"#ef4444"}}/></button></>
              : <><div className="w-14 h-14 rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><Camera size={22} className="text-muted-foreground"/></div>
                  <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Ajouter un logo</p><p className="text-xs text-muted-foreground">PNG, JPG — optionnel</p></div></>}
          </button>
        </Field>
        <Field label="PROPRIÉTAIRE (utilisateur existant)" color="#ef4444">
          {nonAdmin.length===0
            ? <div className="p-3 rounded-xl text-sm" style={{ background:"#ef444415", color:"#ef4444" }}>Aucun utilisateur — créez d'abord un compte dans l'onglet Utilisateurs</div>
            : <select value={bOwner} onChange={e=>setBOwner(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
                <option value="">-- Sélectionner --</option>
                {nonAdmin.map(u=><option key={u.id} value={u.id}>{u.nom} ({u.phone})</option>)}
              </select>
          }
        </Field>
        {bOwner&&nonAdmin.find(u=>u.id===bOwner)&&(
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"#C9A22715" }}>
            <CheckCircle size={15} style={{ color:"#C9A227" }}/>
            <p className="text-xs" style={{ color:"#C9A227" }}>Ce compte sera Propriétaire avec accès total au tenant</p>
          </div>
        )}
        <SubmitBtn color="#C9A227" label="Créer le tenant" onClick={submitBoutique} disabled={!bNom.trim()||!bOwner}/>
      </Modal>}

      {/* Edit boutique modal */}
      {editB&&<Modal title="Modifier le tenant" color="#3b82f6" onClose={()=>setEditB(null)}>
        <Field label="NOM DE LA BOUTIQUE" color="#3b82f6"><input value={eBNom} onChange={e=>setEBNom(e.target.value)} placeholder="Nom de la boutique" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitEditBoutique()}/></Field>
        <Field label="VILLE" color="#3b82f6"><input value={eBVille} onChange={e=>setEBVille(e.target.value)} placeholder="Ville" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitEditBoutique()}/></Field>
        <SubmitBtn color="#3b82f6" label="Enregistrer les modifications" onClick={submitEditBoutique} disabled={!eBNom.trim()}/>
      </Modal>}

      {/* Delete boutique confirmation */}
      {deleteB&&<Modal title="Supprimer le tenant" color="#ef4444" onClose={()=>setDeleteB(null)}>
        <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background:deleteB.color+"15" }}>
          <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black" style={{ background:deleteB.color+"22", color:deleteB.color, fontFamily:"'Nunito', sans-serif" }}>{deleteB.initials}</div>
          <div><p className="font-bold">{deleteB.nom}</p><p className="text-xs text-muted-foreground">{deleteB.ville}</p></div>
        </div>
        <div className="p-4 rounded-2xl" style={{ background:"#ef444415" }}>
          <p className="text-sm font-bold" style={{ color:"#ef4444" }}>⚠️ Cette action est irréversible</p>
          <p className="text-xs text-muted-foreground mt-1">Tous les produits, factures et données de ce tenant seront supprimés définitivement.</p>
        </div>
        <SubmitBtn color="#ef4444" label="Confirmer la suppression" onClick={()=>{ onDeleteBoutique(deleteB.id); setDeleteB(null); }}/>
      </Modal>}

      {/* Create user modal */}
      {newU&&<Modal title="Créer un utilisateur" color="#ef4444" onClose={()=>setNewU(false)}>
        <div className="p-3 rounded-xl text-xs" style={{ background:"#3b82f611", color:"#3b82f6" }}>
          💡 Créez d'abord le compte, puis assignez-le à un tenant depuis la vue Admin de chaque boutique.
        </div>
        <Field label="NOM COMPLET" color="#ef4444"><input value={uNom} onChange={e=>setUNom(e.target.value)} placeholder="Ex: Kadiatou Bah" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitUser()}/></Field>
        <Field label="NUMÉRO DE TÉLÉPHONE (identifiant unique)" color="#ef4444">
          <div className="relative"><Smartphone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input value={uPhone} onChange={e=>{const v=e.target.value;setUPhone(v.startsWith("+221 ")?v:"+221 ");}} placeholder="+221 77 000 0000" type="tel" className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&submitUser()}/>
          </div>
        </Field>
        <Field label="MOT DE PASSE" color="#ef4444"><input value={uPwd} onChange={e=>setUPwd(e.target.value)} placeholder="Mot de passe sécurisé" type="password" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitUser()}/></Field>
        <SubmitBtn color="#ef4444" label="Créer le compte" onClick={submitUser} disabled={!uNom.trim()||!uPhone.trim()||!uPwd.trim()}/>
      </Modal>}

      {/* Reset password modal */}
      {resetTarget&&<Modal title="Réinitialiser le mot de passe" color="#C9A227" onClose={()=>{setResetTarget(null);setNewPwd("");setResetDone(false);}}>
        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background:resetTarget.color+"15" }}>
          <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:resetTarget.color+"22", color:resetTarget.color, fontFamily:"'Nunito', sans-serif" }}>{resetTarget.initials}</div>
          <div><p className="font-bold text-sm">{resetTarget.nom}</p><p className="text-xs text-muted-foreground">{resetTarget.phone}</p></div>
        </div>
        {resetDone
          ? <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background:SEM.success.bg }}><CheckCircle size={22} style={{ color:SEM.success.accent }}/><p className="font-bold text-sm" style={{ color:SEM.success.accent }}>Mot de passe réinitialisé ✓</p></div>
          : <>
            <Field label="NOUVEAU MOT DE PASSE" color="#C9A227">
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="Nouveau mot de passe" type={showP?"text":"password"} className={inputCls+" pl-11 pr-12"} autoFocus onKeyDown={e=>e.key==="Enter"&&submitReset()}/>
                <button onClick={()=>setShowP(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{showP?<EyeOff size={16} className="text-muted-foreground"/>:<Eye size={16} className="text-muted-foreground"/>}</button>
              </div>
            </Field>
            <SubmitBtn color="#C9A227" label="Confirmer" onClick={submitReset} disabled={newPwd.length<4}/>
          </>
        }
      </Modal>}
    </div>
  );
}
