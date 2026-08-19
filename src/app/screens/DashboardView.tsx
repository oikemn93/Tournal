import React, { useState } from "react";
import { Boxes, Users, CreditCard, TrendingDown, ArrowUpRight, BarChart2, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend, ResponsiveContainer } from "recharts";
import type { Boutique, Tab, DashPeriod } from "../types";
import { SEM, MONTHLY, inputCls } from "../constants";
import { fmt } from "../utils/formatting";
import { productQty, invBadge, filterByPeriod } from "../utils/inventory";

export function DashboardView({ boutique, onNavigate }: { boutique: Boutique; onNavigate: (tab: Tab, filter?: Record<string,string>) => void }) {
  const { products, entries, clients, invoices } = boutique;
  const charges = boutique.charges ?? [];
  const [period, setPeriod] = useState<DashPeriod>("jour");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);

  const ca          = filtInv.reduce((s,i) => s + i.acompte, 0);
  const caTotal     = filtInv.reduce((s,i) => s + i.montant, 0);
  const totalCharges= filtCh.reduce((s,c) => s + c.montant, 0);
  const margeBrute  = ca - totalCharges;
  const tauxMarge   = ca > 0 ? Math.round((margeBrute/ca)*100) : 0;
  const impayées    = filtInv.filter(i=>i.status!=="payé");
  const totalImpayé = impayées.reduce((s,i)=>s+(i.montant-i.acompte),0);
  const totalQty    = products.reduce((s,p)=>s+productQty(p.id,entries),0);
  const rupture     = products.filter(p=>productQty(p.id,entries)<=0).length;
  const grossistes  = clients.filter(c=>c.type==="Grossiste").length;

  const pieData = [
    { name:"Encaissé", value:ca, color:"#475569" },
    { name:"Charges",  value:totalCharges, color:"#ef4444" },
  ].filter(d=>d.value>0);

  const barData = (() => {
    if (period === "annee") return MONTHLY;
    if (period === "semaine") {
      const days = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      return days.map((d,i) => {
        const v = filtInv.filter(inv => {
          const raw = inv.date ?? "";
          const parsed = (() => { try { const parts = raw.toLowerCase().split(" "); const months: Record<string,number> = {jan:0,fév:1,mar:2,avr:3,mai:4,jun:5,jul:6,aoû:7,sep:8,oct:9,nov:10,déc:11}; return new Date(new Date().getFullYear(), months[parts[1]?.slice(0,3)]??0, parseInt(parts[0])); } catch { return new Date(); }})();
          return (parsed.getDay()+6)%7 === i;
        }).reduce((s,inv)=>s+inv.acompte,0);
        return { m: d, v: Math.round(v/1000) };
      });
    }
    const map = new Map<string,number>();
    filtInv.forEach(inv => { const k = inv.date.split(" · ")[0]; map.set(k,(map.get(k)??0)+inv.acompte); });
    return Array.from(map.entries()).slice(-10).map(([m,v])=>({ m, v:Math.round(v/1000) }));
  })();

  const kpis: Array<{ label:string; value:string; icon:React.ElementType; color:string; sub:string; tab:Tab; filter?:Record<string,string> }> = [
    { label:"Stock",   value:`${totalQty} pcs`, icon:Boxes,       color:SEM.neutral.accent, sub:`${rupture} en rupture`,        tab:"stock",    filter:{ stockFilter:"critical" } },
    { label:"Clients", value:`${clients.length}`,icon:Users,       color:SEM.neutral.accent, sub:`${grossistes} grossistes`,     tab:"clients",  filter:{ clientTab:"Grossiste" } },
    { label:"Impayés", value:fmt(totalImpayé),   icon:CreditCard,  color:SEM.danger.accent,  sub:`${impayées.length} factures`,  tab:"factures", filter:{ statusFilter:"impayé" } },
    { label:"Charges", value:fmt(totalCharges),  icon:TrendingDown,color:SEM.neutral.accent, sub:`${filtCh.length} entrées`,     tab:"charges" },
  ];

  const periodBtns: Array<{id:DashPeriod;label:string}> = [
    {id:"jour",label:"Jour"},{id:"semaine",label:"Sem."},{id:"mois",label:"Mois"},{id:"annee",label:"An"},{id:"custom",label:"📅"},
  ];

  return (
    <div className="space-y-4 pb-4">
      {/* Period selector */}
      <div className="flex gap-1.5 bg-card rounded-2xl p-1.5 border border-border">
        {periodBtns.map(p=>(
          <button key={p.id} onClick={()=>setPeriod(p.id)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{background:period===p.id?"#1f2937":"transparent",color:period===p.id?"#fff":"#6b7280"}}>
            {p.label}
          </button>
        ))}
      </div>
      {period==="custom" && (
        <div className="flex gap-2">
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">DU</label><input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className={inputCls}/></div>
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">AU</label><input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className={inputCls}/></div>
        </div>
      )}

      {/* Margin summary */}
      <div className="bg-card rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-sm">Résultat de la période</p>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{background:margeBrute>=0?SEM.success.bg:"#ef444422",color:margeBrute>=0?SEM.success.accent:SEM.danger.accent}}>{tauxMarge}% marge</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {label:"CA Encaissé", value:ca, color:"#1f2937"},
            {label:"Charges",     value:totalCharges, color:"#ef4444"},
            {label:"Marge nette", value:margeBrute, color:margeBrute>=0?SEM.success.accent:SEM.danger.accent},
          ].map(m=>(
            <div key={m.label} className="rounded-xl p-2.5 text-center" style={{background:m.color+"11"}}>
              <p className="text-base font-black leading-tight" style={{color:m.color,fontFamily:"'Nunito',sans-serif"}}>{fmt(m.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k=>{
          const isSemantic = k.color===SEM.danger.accent||k.color===SEM.success.accent||k.color===SEM.warning.accent;
          return (
          <button key={k.label} onClick={()=>onNavigate(k.tab, k.filter)}
            className="bg-card rounded-2xl p-4 border text-left active:scale-[0.97] transition-transform"
            style={{ borderColor: isSemantic ? k.color+"44" : "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:isSemantic?k.color+"15":"#f3f4f6"}}>
                <k.icon size={22} style={{color:isSemantic?k.color:"#374151"}}/>
              </div>
              <ArrowUpRight size={14} style={{color:isSemantic?k.color:"#9ca3af"}}/>
            </div>
            <p className="text-lg font-black leading-tight" style={{fontFamily:"'Nunito',sans-serif",color:isSemantic?k.color:"#1f2937"}}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            <p className="text-xs font-bold mt-1" style={{color:isSemantic?k.color:"#6b7280"}}>{k.sub}</p>
          </button>);
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {barData.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-sm">Ventes <span className="text-muted-foreground font-normal text-xs">(×1 000 F)</span></p><BarChart2 size={16} className="text-muted-foreground"/></div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={barData} barSize={20} margin={{top:4,right:0,left:0,bottom:0}}>
                <XAxis dataKey="m" tick={{fill:"#6b7280",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip cursor={{fill:"rgba(0,0,0,0.04)"}} content={({active,payload})=>active&&payload?.length?<div className="bg-popover border border-border rounded-xl px-3 py-1.5 text-xs font-bold" style={{color:"#1f2937"}}>{payload[0].value}k F</div>:null}/>
                <Bar key="bar-ventes" name="ventes" dataKey="v" radius={[4,4,0,0]}>
                  {barData.map((_d,i)=><Cell key={`bar-cell-${i}`} fill={i===barData.length-1?"#1f2937":"#cbd5e1"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {pieData.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-sm">Répartition</p><PieChartIcon size={16} className="text-muted-foreground"/></div>
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie key="pie-repartition" name="repartition" data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={52} paddingAngle={3}>
                  {pieData.map((e,i)=><Cell key={`pie-cell-${i}`} fill={e.color}/>)}
                </Pie>
                <Tooltip formatter={(v:number)=>fmt(v)} contentStyle={{borderRadius:12,border:"1px solid var(--border)",fontSize:11}}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent invoices */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3"><p className="font-bold text-sm">Factures récentes</p><button onClick={()=>onNavigate("factures")} className="text-xs font-bold" style={{color:SEM.neutral.accent}}>Voir tout →</button></div>
        {[...invoices].reverse().slice(0,4).map(inv=>{const [tc,bc]=invBadge(inv.status);return(
          <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p></div>
            <div className="text-right"><p className="text-sm font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(inv.montant)}</p><span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize" style={{background:bc,color:tc}}>{inv.status}</span></div>
          </div>
        );})}
      </div>
    </div>
  );
}
