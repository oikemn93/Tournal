import React, { useState } from "react";
import { Store, Smartphone, Lock, Eye, EyeOff, X } from "lucide-react";
import type { PlatformUser } from "../types";
import { inputCls } from "../constants";
import { cleanPhone } from "../utils/formatting";

export function LoginScreen({ platformUsers, onLogin }: { platformUsers: PlatformUser[]; onLogin: (u: PlatformUser) => void }) {
  const [phone, setPhone] = useState("+221 "); const [pwd, setPwd] = useState(""); const [show, setShow] = useState(false); const [err, setErr] = useState("");
  function login() {
    const u = platformUsers.find(u => cleanPhone(u.phone) === cleanPhone(phone) && u.password === pwd);
    if (u) { setErr(""); onLogin(u); } else setErr("Numéro ou mot de passe incorrect");
  }
  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col" style={{ fontFamily:"'Inter', sans-serif" }}>
      <div className="px-6 pt-16 pb-8 text-center">
        <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background:"#C9A22722" }}><Store size={40} style={{ color:"#C9A227" }} /></div>
        <h1 className="text-3xl font-black mb-1" style={{ fontFamily:"'Nunito', sans-serif", color:"#C9A227" }}>Tournal</h1>
        <p className="text-sm text-muted-foreground">Gestion simplifiée pour les commerçants</p>
      </div>
      <div className="flex-1 px-6 space-y-4">
        <div>
          <label className="text-xs font-black mb-2 block tracking-wider" style={{ color:"#C9A227" }}>NUMÉRO DE TÉLÉPHONE</label>
          <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={phone} onChange={e=>{const v=e.target.value;setPhone(v.startsWith("+221 ")?v:"+221 ");setErr("");}} placeholder="+221 77 000 0000" type="tel" className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&login()} /></div>
        </div>
        <div>
          <label className="text-xs font-black mb-2 block tracking-wider" style={{ color:"#C9A227" }}>MOT DE PASSE</label>
          <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="••••••••" type={show?"text":"password"} className={inputCls+" pl-11 pr-12"} onKeyDown={e=>e.key==="Enter"&&login()} />
            <button onClick={()=>setShow(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{show?<EyeOff size={18} className="text-muted-foreground"/>:<Eye size={18} className="text-muted-foreground"/>}</button></div>
        </div>
        {err&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background:"#ef444415" }}><X size={14} style={{ color:"#ef4444" }}/><p className="text-sm font-semibold" style={{ color:"#ef4444" }}>{err}</p></div>}
        <button onClick={login} className="w-full py-4 rounded-2xl text-base font-black active:scale-95" style={{ background:"#C9A227", color:"#fff", fontFamily:"'Nunito', sans-serif" }}>Se connecter →</button>
      </div>
    </div>
  );
}
