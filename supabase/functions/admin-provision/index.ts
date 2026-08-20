import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function phoneToEmail(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) throw new Error("Numéro de téléphone invalide");
  return `${digits}@tournal.internal`;
}
function initialsOf(name: string): string {
  return String(name ?? "").trim().split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase();
}
const passwordOk=(v:unknown)=>String(v??"").length>=12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    if (action === "ping") return json({ ok:true, time:new Date().toISOString(), action:"ping" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error:"Non authentifié" },401);
    const { data:{ user:caller }, error:authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error:"Token invalide" },401);

    const { data:callerPlatform, error:platformErr } = await admin.from("platform_users")
      .select("id,is_super_admin,is_suspended").eq("id",caller.id).single();
    if (platformErr || !callerPlatform) return json({ error:"Impossible de vérifier les privilèges" },403);
    if (callerPlatform.is_suspended) return json({ error:"Compte suspendu" },403);
    const isSuperAdmin = callerPlatform.is_super_admin === true;

    async function isOwnerOf(boutiqueId:string):Promise<boolean> {
      if (isSuperAdmin) return true;
      const { data } = await admin.from("boutique_assignments").select("role")
        .eq("boutique_id",boutiqueId).eq("user_id",caller.id).maybeSingle();
      return data?.role === "owner";
    }
    async function getTarget(userId:string) {
      const { data,error } = await admin.from("platform_users")
        .select("id,phone,nom,is_super_admin,is_suspended,suspension_reason")
        .eq("id",userId).maybeSingle();
      if (error || !data) throw new Error("Utilisateur introuvable");
      return data;
    }
    function requireSuperAdmin() {
      if (!isSuperAdmin) throw new Error("SuperAdmin requis");
    }

    if (action === "create_boutique") {
      if (!isSuperAdmin) return json({ error:"SuperAdmin requis" },403);
      const { nom,ville,ownerId } = body;
      if (!nom || !ownerId) return json({ error:"Champs requis manquants" },400);
      const { data:b,error } = await admin.from("boutiques")
        .insert({ nom,ville:ville ?? "",color:"#C9A227",initials:String(nom).slice(0,2).toUpperCase(),owner_id:ownerId })
        .select("id").single();
      if (error) return json({ error:error.message },400);
      const { error:assignError } = await admin.from("boutique_assignments").upsert(
        { boutique_id:b.id,user_id:ownerId,role:"owner",droits:{} },{ onConflict:"boutique_id,user_id" });
      if (assignError) return json({ error:assignError.message },400);
      return json({ boutiqueId:b.id });
    }

    if (action === "create_user") {
      const { phone,fullName,password,boutiqueId } = body;
      const requestId = typeof body.requestId === "string" ? body.requestId : `${Date.now()}-${crypto.randomUUID()}`;
      if (boutiqueId && !(await isOwnerOf(boutiqueId))) return json({ error:"Accès refusé" },403);
      if (!phone || !fullName || !passwordOk(password)) return json({ error:"Nom, téléphone et mot de passe temporaire d’au moins 12 caractères requis" },400);
      const email=phoneToEmail(phone);
      const { data:created,error } = await admin.auth.admin.createUser({ email,password,email_confirm:true,user_metadata:{ nom:fullName,phone } });
      if (error) return json({ error:error.message },400);
      const uid=created.user.id;
      const colors=["#C9A227","#2563eb","#16a34a","#dc2626","#9333ea","#0891b2","#ea580c"];
      const { count }=await admin.from("platform_users").select("*",{count:"exact",head:true});
      const color=colors[(count ?? 0)%colors.length];
      const payload={ id:uid,phone,nom:fullName,initials:initialsOf(fullName),color,is_super_admin:false,is_suspended:false,must_change_password:true };
      const { error:puErr }=await admin.from("platform_users").upsert(payload,{onConflict:"id",ignoreDuplicates:true});
      if (puErr) {
        const conflictText=`${puErr.message ?? ""} ${puErr.details ?? ""}`;
        const phoneConflict=puErr.code==="23505" && /phone|platform_users_phone_key/i.test(conflictText);
        if (!phoneConflict) return json({error:puErr.message},400);
        const { data:existing }=await admin.from("platform_users").select("id,phone").eq("phone",phone).maybeSingle();
        if (!existing) return json({error:puErr.message},400);
        await admin.from("platform_users").update({nom:fullName,initials:initialsOf(fullName),color,is_super_admin:false}).eq("id",existing.id);
        if (existing.id!==uid) await admin.auth.admin.deleteUser(uid);
        return json({userId:existing.id,nom:fullName,initials:initialsOf(fullName),color,phone,requestId});
      }
      return json({userId:uid,nom:fullName,initials:initialsOf(fullName),color,phone,requestId});
    }

    if (action === "reset_password") {
      const { userId,password }=body;
      if (!userId || !passwordOk(password)) return json({error:"Utilisateur et mot de passe temporaire d’au moins 12 caractères requis"},400);
      if (!isSuperAdmin) {
        const { data:assignments }=await admin.from("boutique_assignments").select("boutique_id").eq("user_id",userId);
        const checks=await Promise.all((assignments ?? []).map(a=>isOwnerOf(a.boutique_id)));
        if (!checks.some(Boolean)) return json({error:"Accès refusé"},403);
      }
      const { error }=await admin.auth.admin.updateUserById(userId,{password});
      if (error) return json({error:error.message},400);
      const { error:profileResetError }=await admin.from("platform_users").update({must_change_password:true}).eq("id",userId);
      if (profileResetError) return json({error:profileResetError.message},400);
      return json({ok:true});
    }

    if (action === "assign_user") {
      const { boutiqueId,userId,role,droits }=body;
      if (!boutiqueId || !userId || !role) return json({error:"Champs requis manquants"},400);
      if (!(await isOwnerOf(boutiqueId))) return json({error:"Accès refusé"},403);
      const target=await getTarget(userId);
      if (target.is_suspended) return json({error:"Réactivez le compte avant de modifier ses accès"},400);
      const { error }=await admin.from("boutique_assignments").upsert({boutique_id:boutiqueId,user_id:userId,role,droits},{onConflict:"boutique_id,user_id"});
      if (error) return json({error:error.message},400);
      if (role==="owner") await admin.from("boutiques").update({owner_id:userId}).eq("id",boutiqueId);
      return json({ok:true});
    }

    if (action === "unassign_user") {
      const { boutiqueId,userId }=body;
      if (!boutiqueId || !userId) return json({error:"Champs requis manquants"},400);
      if (!(await isOwnerOf(boutiqueId))) return json({error:"Accès refusé"},403);
      const { data:a }=await admin.from("boutique_assignments").select("role").eq("boutique_id",boutiqueId).eq("user_id",userId).maybeSingle();
      if (a?.role==="owner" && !isSuperAdmin) return json({error:"Seul le superadmin peut retirer un propriétaire"},403);
      const { error }=await admin.from("boutique_assignments").delete().eq("boutique_id",boutiqueId).eq("user_id",userId);
      if (error) return json({error:error.message},400);
      if (a?.role==="owner") await admin.from("boutiques").update({owner_id:null}).eq("id",boutiqueId).eq("owner_id",userId);
      return json({ok:true});
    }

    if (action === "update_user") {
      requireSuperAdmin();
      const { userId,fullName,phone }=body;
      if (!userId || !fullName || !phone) return json({error:"Nom, téléphone et utilisateur requis"},400);
      const target=await getTarget(userId);
      if (target.is_super_admin && userId!==caller.id) return json({error:"Modification d’un autre superadmin interdite"},403);
      const authAttrs:any={ user_metadata:{nom:String(fullName).trim(),phone:String(phone).trim()} };
      if (String(phone).trim()!==target.phone) { authAttrs.email=phoneToEmail(phone); authAttrs.email_confirm=true; }
      const { error:authUpdateError }=await admin.auth.admin.updateUserById(userId,authAttrs);
      if (authUpdateError) return json({error:authUpdateError.message},400);
      const { error:profileError }=await admin.from("platform_users").update({nom:String(fullName).trim(),phone:String(phone).trim(),initials:initialsOf(fullName)}).eq("id",userId);
      if (profileError) return json({error:profileError.message},400);
      return json({ok:true});
    }

    if (action === "set_user_suspended") {
      requireSuperAdmin();
      const { userId,suspended,reason }=body;
      if (!userId || typeof suspended!=="boolean") return json({error:"Paramètres invalides"},400);
      const target=await getTarget(userId);
      if (target.is_super_admin) return json({error:"Le superadmin ne peut pas être suspendu"},403);
      const { error:authBanError }=await admin.auth.admin.updateUserById(userId,{ban_duration:suspended?"876000h":"none"});
      if (authBanError) return json({error:authBanError.message},400);
      const { error:profileError }=await admin.from("platform_users").update({
        is_suspended:suspended,
        suspension_reason:suspended?(String(reason ?? "").trim() || "Suspendu par le superadmin"):null,
        suspended_at:suspended?new Date().toISOString():null,
        suspended_by:suspended?caller.id:null,
      }).eq("id",userId);
      if (profileError) return json({error:profileError.message},400);
      return json({ok:true,isSuspended:suspended});
    }

    if (action === "delete_user") {
      requireSuperAdmin();
      const { userId }=body;
      if (!userId) return json({error:"Utilisateur requis"},400);
      if (userId===caller.id) return json({error:"Impossible de supprimer votre propre compte"},403);
      const target=await getTarget(userId);
      if (target.is_super_admin) return json({error:"Suppression d’un superadmin interdite"},403);
      const { data:owned }=await admin.from("boutiques").select("id").eq("owner_id",userId);
      for (const b of owned ?? []) {
        await admin.from("boutiques").update({owner_id:caller.id}).eq("id",b.id);
        await admin.from("boutique_assignments").upsert({boutique_id:b.id,user_id:caller.id,role:"owner",droits:{}},{onConflict:"boutique_id,user_id"});
      }
      const { error }=await admin.auth.admin.deleteUser(userId);
      if (error) return json({error:error.message},400);
      return json({ok:true,transferredBoutiques:(owned ?? []).map(b=>b.id)});
    }

    if (action === "get_user_debug") {
      requireSuperAdmin();
      const { userId }=body;
      if (!userId) return json({error:"Utilisateur requis"},400);
      const target=await getTarget(userId);
      const [{data:authUser,error:authUserError},{data:assignments,error:assignError}] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("boutique_assignments").select("boutique_id,role,droits,boutiques(nom,ville)").eq("user_id",userId),
      ]);
      if (authUserError) return json({error:authUserError.message},400);
      if (assignError) return json({error:assignError.message},400);
      return json({
        user:{id:target.id,nom:target.nom,phone:target.phone,isSuspended:target.is_suspended,suspensionReason:target.suspension_reason},
        auth:{createdAt:authUser.user?.created_at,lastSignInAt:authUser.user?.last_sign_in_at,bannedUntil:authUser.user?.banned_until,email:authUser.user?.email},
        assignments:assignments ?? [],
      });
    }

    return json({error:`Action inconnue : ${action}`},400);
  } catch (e) {
    const message=e instanceof Error?e.message:"Erreur interne";
    const status=message==="SuperAdmin requis"?403:500;
    return json({error:message},status);
  }
});

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
