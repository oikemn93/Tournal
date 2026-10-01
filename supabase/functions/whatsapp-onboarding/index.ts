import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WHATSAPP_TEMPLATE_NAME=Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "tournal_onboarding_credentials";
const WHATSAPP_TEMPLATE_LANGUAGE_CODE=Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE_CODE") ?? "fr";
const WHATSAPP_GRAPH_VERSION=Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0";
const TOURNAL_LOGIN_URL=Deno.env.get("TOURNAL_LOGIN_URL") ?? "https://tournal.org";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}

function normalizePhone(value:string){
  return String(value??"").replace(/\D/g,"").replace(/^00/,"");
}

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);

  try{
    const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"").trim();
    if(!token) return json({error:"Non authentifié"},401);

    const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:authError}=await admin.auth.getUser(token);
    if(authError||!user) return json({error:"Token invalide"},401);

    const {data:platformUser,error:profileError}=await admin.from("platform_users")
      .select("is_super_admin,is_suspended,must_change_password")
      .eq("id",user.id).single();
    if(profileError||!platformUser?.is_super_admin) return json({error:"SuperAdmin requis"},403);
    if(platformUser.is_suspended) return json({error:"Compte suspendu"},403);
    if(platformUser.must_change_password) return json({error:"Changement de mot de passe requis"},403);

    if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_PHONE_NUMBER_ID){
      return json({error:"WhatsApp Business non configuré : renseignez WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID dans les secrets Supabase."},503);
    }

    const body=await req.json().catch(()=>({}));
    const phone=normalizePhone(body.phone);
    const fullName=String(body.fullName??"").trim();
    const boutiqueName=String(body.boutiqueName??"").trim();
    const temporaryPassword=String(body.temporaryPassword??"").trim();
    if(phone.length<8||!fullName||!boutiqueName||temporaryPassword.length<12){
      return json({error:"Informations d’onboarding incomplètes"},400);
    }

    const payload={
      messaging_product:"whatsapp",
      to:phone,
      type:"template",
      template:{
        name:WHATSAPP_TEMPLATE_NAME,
        language:{code:WHATSAPP_TEMPLATE_LANGUAGE_CODE},
        components:[{
          type:"body",
          parameters:[
            {type:"text",text:fullName},
            {type:"text",text:boutiqueName},
            {type:"text",text:phone},
            {type:"text",text:temporaryPassword},
            {type:"text",text:TOURNAL_LOGIN_URL},
          ],
        }],
      },
    };

    const response=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type":"application/json",
      },
      body:JSON.stringify(payload),
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      return json({error:result?.error?.message??"Envoi WhatsApp impossible",meta_code:result?.error?.code??null},502);
    }
    return json({ok:true,messageId:result?.messages?.[0]?.id??null});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Erreur interne"},500);
  }
});
