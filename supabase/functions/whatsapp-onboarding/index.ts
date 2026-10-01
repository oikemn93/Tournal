import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WHATSAPP_WABA_ID=Deno.env.get("WHATSAPP_WABA_ID") ?? "";
const WHATSAPP_TEMPLATE_NAME=Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "tournal_onboarding_credentials";
const WHATSAPP_TEMPLATE_LANGUAGE_CODE=Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE_CODE") ?? "fr";
const WHATSAPP_REGISTRATION_PIN=Deno.env.get("WHATSAPP_REGISTRATION_PIN") ?? "";
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

    const graphHeaders={
      Authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type":"application/json",
    };
    const sendMessage=async()=>{
      const response=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,{
        method:"POST",
        headers:graphHeaders,
        body:JSON.stringify(payload),
      });
      const result=await response.json().catch(()=>null);
      return {response,result};
    };

    let attempt=await sendMessage();
    if(!attempt.response.ok && Number(attempt.result?.error?.code)===133010){
      if(!/^\\d{6}$/.test(WHATSAPP_REGISTRATION_PIN)){
        return json({
          error:"Numéro WhatsApp non enregistré dans Cloud API. Ajoutez un secret Supabase WHATSAPP_REGISTRATION_PIN contenant le PIN Meta à 6 chiffres, puis réessayez.",
          meta_code:133010,
          needs_registration:true,
        },503);
      }
      const registerResponse=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/register`,{
        method:"POST",
        headers:graphHeaders,
        body:JSON.stringify({messaging_product:"whatsapp",pin:WHATSAPP_REGISTRATION_PIN}),
      });
      const registerResult=await registerResponse.json().catch(()=>null);
      if(!registerResponse.ok){
        return json({
          error:registerResult?.error?.message??"Enregistrement du numéro WhatsApp impossible",
          meta_code:registerResult?.error?.code??null,
          needs_registration:true,
        },502);
      }
      attempt=await sendMessage();
    }

    if(!attempt.response.ok && Number(attempt.result?.error?.code)===132001){
      if(!WHATSAPP_WABA_ID){
        return json({
          error:"Template WhatsApp introuvable. Ajoutez le secret Supabase WHATSAPP_WABA_ID pour que Tournal vérifie ou crée automatiquement le template.",
          meta_code:132001,
          needs_waba_id:true,
        },503);
      }

      const templatesResponse=await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_WABA_ID}/message_templates?name=${encodeURIComponent(WHATSAPP_TEMPLATE_NAME)}`,
        {headers:graphHeaders},
      );
      const templatesResult=await templatesResponse.json().catch(()=>null);
      if(!templatesResponse.ok){
        return json({
          error:templatesResult?.error?.message??"Lecture des templates WhatsApp impossible",
          meta_code:templatesResult?.error?.code??null,
        },502);
      }

      const templates=Array.isArray(templatesResult?.data)?templatesResult.data:[];
      const approved=templates.find((item:any)=>item?.status==="APPROVED");
      if(approved?.language){
        payload.template.language.code=String(approved.language);
        attempt=await sendMessage();
      }else if(templates.length>0){
        const current=templates[0];
        return json({
          error:`Le template WhatsApp "${WHATSAPP_TEMPLATE_NAME}" existe mais son statut Meta est ${current?.status??"inconnu"}. Attendez son approbation avant l’envoi.`,
          meta_code:132001,
          template_status:current?.status??null,
          template_language:current?.language??null,
        },409);
      }else{
        const createResponse=await fetch(
          `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_WABA_ID}/message_templates`,
          {
            method:"POST",
            headers:graphHeaders,
            body:JSON.stringify({
              name:WHATSAPP_TEMPLATE_NAME,
              language:WHATSAPP_TEMPLATE_LANGUAGE_CODE,
              category:"UTILITY",
              components:[{
                type:"BODY",
                text:"Bonjour {{1}}, votre accès Tournal pour {{2}} est prêt. Téléphone de connexion : {{3}}. Mot de passe temporaire : {{4}}. Connectez-vous sur {{5}} et changez votre mot de passe à la première connexion.",
                example:{
                  body_text:[["Awa Diallo","Boutique GGR","+221781224409","TempPass123!","https://tournal.org"]],
                },
              }],
            }),
          },
        );
        const createResult=await createResponse.json().catch(()=>null);
        if(!createResponse.ok){
          return json({
            error:createResult?.error?.message??"Création du template WhatsApp impossible",
            meta_code:createResult?.error?.code??null,
          },502);
        }
        return json({
          error:`Le template WhatsApp "${WHATSAPP_TEMPLATE_NAME}" vient d’être créé chez Meta et attend son approbation. Réessayez l’envoi lorsqu’il sera APPROVED.`,
          meta_code:132001,
          template_status:createResult?.status??"PENDING",
          template_id:createResult?.id??null,
          template_created:true,
        },409);
      }
    }

    if(!attempt.response.ok){
      return json({error:attempt.result?.error?.message??"Envoi WhatsApp impossible",meta_code:attempt.result?.error?.code??null},502);
    }
    return json({ok:true,messageId:attempt.result?.messages?.[0]?.id??null});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Erreur interne"},500);
  }
});
