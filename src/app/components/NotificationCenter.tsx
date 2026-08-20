import React, { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronLeft, Search, Settings, X } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "../../lib/notifications";
import {
  getNotificationHistory,
  getNotificationPreferences,
  NOTIFICATION_CATEGORIES,
  setNotificationPreference,
  type NotificationCategory,
  type NotificationHistoryItem,
  type NotificationPreference,
} from "../../lib/notification-center";

type BoutiqueOption = { id: string; nom: string };

type Props = {
  open: boolean;
  onClose: () => void;
  boutiques: BoutiqueOption[];
  activeBoutiqueId: string;
  canManageSettings: boolean;
  onNavigate: (tab: string, filter?: Record<string,string>) => void;
  onChanged?: () => void;
};

const PAGE_SIZE = 50;

function categoryMeta(category: string) {
  return NOTIFICATION_CATEGORIES.find(c => c.id === category) ?? { id:"general", label:"Général", icon:"🔔" };
}

export function NotificationCenter({ open, onClose, boutiques, activeBoutiqueId, canManageSettings, onNavigate, onChanged }: Props) {
  const [section, setSection] = useState<"history"|"settings">("history");
  const [items, setItems] = useState<NotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [boutiqueFilter, setBoutiqueFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory|"all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [prefs, setPrefs] = useState<Record<string,NotificationPreference>>({});
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  const boutiqueNames = useMemo(() => new Map(boutiques.map(b => [b.id,b.nom])), [boutiques]);
  const activeBoutiqueName = boutiqueNames.get(activeBoutiqueId) ?? "Boutique";

  async function loadHistory(append = false) {
    const offset = append ? items.length : 0;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const rows = await getNotificationHistory({
        limit: PAGE_SIZE,
        offset,
        boutiqueId: boutiqueFilter === "all" ? undefined : boutiqueFilter,
        category: categoryFilter,
        unreadOnly,
        search,
      });
      setItems(prev => append ? [...prev,...rows] : rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }

  async function loadPrefs() {
    if (!activeBoutiqueId || !canManageSettings) return;
    setPrefsLoading(true); setError("");
    try {
      const rows = await getNotificationPreferences(activeBoutiqueId);
      const next: Record<string,NotificationPreference> = {};
      for (const category of NOTIFICATION_CATEGORIES) {
        const row = rows.find(r => r.category === category.id);
        next[category.id] = row ?? {
          boutique_id: activeBoutiqueId,
          category: category.id,
          in_app_enabled: true,
          push_enabled: true,
        };
      }
      setPrefs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paramètres indisponibles");
    } finally { setPrefsLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setSection("history");
    setBoutiqueFilter("all");
    setCategoryFilter("all");
    setUnreadOnly(false);
    setSearch("");
    void loadHistory(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || section !== "history") return;
    const id = window.setTimeout(() => { void loadHistory(false); }, 220);
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boutiqueFilter, categoryFilter, unreadOnly, search, section]);

  useEffect(() => {
    if (open && section === "settings") void loadPrefs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section, activeBoutiqueId]);

  if (!open) return null;

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setItems(prev => prev.map(n => ({...n,read_at:n.read_at ?? new Date().toISOString()})));
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Action impossible"); }
  }

  async function openItem(item: NotificationHistoryItem) {
    if (!item.read_at) {
      try { await markNotificationRead(item.id); } catch {}
      setItems(prev => prev.map(n => n.id===item.id ? {...n,read_at:new Date().toISOString()} : n));
      onChanged?.();
    }
    if (item.action_tab) onNavigate(item.action_tab,item.action_filter ?? undefined);
    onClose();
  }

  async function togglePreference(category: NotificationCategory, channel: "in_app"|"push") {
    const current = prefs[category] ?? {
      boutique_id: activeBoutiqueId,
      category,
      in_app_enabled: true,
      push_enabled: true,
    };
    const next = {
      ...current,
      in_app_enabled: channel === "in_app" ? !current.in_app_enabled : current.in_app_enabled,
      push_enabled: channel === "push" ? !current.push_enabled : current.push_enabled,
    };
    const key = `${category}:${channel}`;
    setSavingKey(key);
    setPrefs(prev => ({...prev,[category]:next}));
    try {
      await setNotificationPreference(activeBoutiqueId,category,next.in_app_enabled,next.push_enabled);
    } catch (e) {
      setPrefs(prev => ({...prev,[category]:current}));
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setSavingKey(""); }
  }

  const unreadCount = items.filter(n=>!n.read_at).length;

  return (
    <div className="fixed inset-0 z-[260] bg-background text-foreground flex flex-col" style={{fontFamily:"'Inter',sans-serif"}}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted" aria-label="Fermer"><ChevronLeft size={20}/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><Bell size={18}/><h2 className="font-black text-lg">Centre de notifications</h2></div>
          <p className="text-xs text-muted-foreground">Historique et réglages de la boutique</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center" aria-label="Fermer"><X size={18}/></button>
      </header>

      <div className="flex gap-1.5 p-2 border-b border-border bg-card">
        <button onClick={()=>setSection("history")} className="flex-1 py-2.5 rounded-xl text-sm font-black" style={{background:section==="history"?"#111827":"transparent",color:section==="history"?"#fff":"#6b7280"}}>Historique</button>
        {canManageSettings&&<button onClick={()=>setSection("settings")} className="flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2" style={{background:section==="settings"?"#111827":"transparent",color:section==="settings"?"#fff":"#6b7280"}}><Settings size={14}/> Paramètres</button>}
      </div>

      {error&&<div role="alert" className="mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-semibold bg-red-50 text-red-700">{error}</div>}

      {section === "history" ? (
        <>
          <div className="p-3 border-b border-border bg-card space-y-2 flex-shrink-0">
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher une notification…" className="w-full rounded-xl border border-border bg-muted pl-9 pr-3 py-2.5 text-sm outline-none"/></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={boutiqueFilter} onChange={e=>setBoutiqueFilter(e.target.value)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold"><option value="all">Toutes les boutiques</option>{boutiques.map(b=><option key={b.id} value={b.id}>{b.nom}</option>)}</select>
              <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value as NotificationCategory|"all")} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold"><option value="all">Tous les types</option>{NOTIFICATION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
              <button onClick={()=>setUnreadOnly(v=>!v)} className="rounded-xl border px-3 py-2.5 text-xs font-bold" style={{borderColor:unreadOnly?"#2563eb":"var(--border)",background:unreadOnly?"#eff6ff":"transparent",color:unreadOnly?"#1d4ed8":"#6b7280"}}>Non lues seulement</button>
              <button onClick={()=>void markAllRead()} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold">Tout marquer lu</button>
            </div>
            <div className="flex items-center justify-between px-1"><p className="text-xs text-muted-foreground">{items.length} affichée{items.length>1?"s":""}{unreadCount?` · ${unreadCount} non lue${unreadCount>1?"s":""}`:""}</p></div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Chargement des notifications…</div> : items.length===0 ? <div className="py-16 text-center"><Bell size={30} className="mx-auto mb-3 text-muted-foreground opacity-40"/><p className="text-sm font-bold">Aucune notification</p><p className="text-xs text-muted-foreground mt-1">Modifiez les filtres ou attendez un nouvel événement.</p></div> : items.map(item=>{
              const meta=categoryMeta(item.category); const boutique=boutiqueNames.get(item.boutique_id??"");
              return <button key={item.id} onClick={()=>void openItem(item)} className="w-full text-left flex gap-3 px-4 py-3.5 border-b border-border/60 hover:bg-muted/50" style={{background:item.read_at?"transparent":"#eff6ff55"}}>
                <span className="text-xl mt-0.5">{item.icon||meta.icon}</span>
                <div className="flex-1 min-w-0"><div className="flex items-start gap-2"><p className="font-bold text-sm flex-1">{item.title}</p>{!item.read_at&&<span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"/>}</div><p className="text-xs text-muted-foreground mt-0.5">{item.body}</p><div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[10px] text-muted-foreground"><span>{meta.label}</span>{boutique&&<span>· {boutique}</span>}<span>· {new Date(item.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>{item.push_enabled&&<span>· Push</span>}</div></div>
              </button>;
            })}
            {hasMore&&<div className="p-4"><button onClick={()=>void loadHistory(true)} disabled={loadingMore} className="w-full py-3 rounded-xl border border-border text-sm font-bold disabled:opacity-50">{loadingMore?"Chargement…":"Charger plus"}</button></div>}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4"><p className="font-black">{activeBoutiqueName}</p><p className="text-xs text-muted-foreground mt-1">Choisissez pour chaque type si l’événement apparaît dans la cloche et/ou déclenche une notification Push. Les droits utilisateurs continuent de filtrer les destinataires.</p></div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-4 py-3 border-b border-border text-[10px] font-black uppercase tracking-wide text-muted-foreground"><span>Type</span><span className="text-center">Cloche</span><span className="text-center">Push</span></div>
              {prefsLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Chargement des paramètres…</div> : NOTIFICATION_CATEGORIES.map(cat=>{
                const pref=prefs[cat.id]??{boutique_id:activeBoutiqueId,category:cat.id,in_app_enabled:true,push_enabled:true};
                const toggle=(active:boolean,busy:boolean)=><span className="w-11 h-6 rounded-full p-0.5 flex transition-all" style={{background:active?"#16a34a":"#d1d5db",opacity:busy?0.55:1}}><span className="w-5 h-5 bg-white rounded-full shadow transition-transform" style={{transform:active?"translateX(20px)":"translateX(0)"}}/></span>;
                return <div key={cat.id} className="grid grid-cols-[1fr_72px_72px] gap-2 items-center px-4 py-3 border-b border-border last:border-0"><div className="flex items-center gap-3 min-w-0"><span className="text-lg">{cat.icon}</span><div><p className="text-sm font-bold">{cat.label}</p><p className="text-[10px] text-muted-foreground">{pref.in_app_enabled||pref.push_enabled?"Actif":"Désactivé"}</p></div></div><button onClick={()=>void togglePreference(cat.id,"in_app")} disabled={!!savingKey} className="flex justify-center" aria-label={`Cloche ${cat.label}`}>{toggle(pref.in_app_enabled,savingKey===`${cat.id}:in_app`)}</button><button onClick={()=>void togglePreference(cat.id,"push")} disabled={!!savingKey} className="flex justify-center" aria-label={`Push ${cat.label}`}>{toggle(pref.push_enabled,savingKey===`${cat.id}:push`)}</button></div>;
              })}
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 text-emerald-800 px-4 py-3 text-xs"><Check size={15} className="mt-0.5 flex-shrink-0"/><p>Les réglages sont enregistrés immédiatement pour cette boutique et s’appliquent aux prochains événements sur tous les appareils.</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
