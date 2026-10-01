import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WHATSAPP_WABA_ID=Deno.env.get("WHATSAPP_WABA_ID") ?? "";
const WHATSAPP_REGISTRATION_PIN=Deno.env.get("WHATSAPP_REGISTRATION_PIN") ?? "";
const WHATSAPP_UTILITY_TEMPLATE_NAME=Deno.env.get("WHATSAPP_UTILITY_TEMPLATE_NAME") ?? "tournal_account_ready_v1";
const WHATSAPP_AUTH_TEMPLATE_NAME=Deno.env.get("WHATSAPP_AUTH_TEMPLATE_NAME") ?? "tournal_login_code_v1";
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
function generateAuthCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random=new Uint32Array(14);
  crypto.getRandomValues(random);
  return Array.from(random,n=>chars[n%chars.length]).join("");
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

    if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_PHONE_NUMBER_ID||!WHATSAPP_WABA_ID){
      return json({error:"WhatsApp Business non configuré : WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID et WHATSAPP_WABA_ID sont requis."},503);
    }

    const body=await req.json().catch(()=>({}));
    const rawPhone=String(body.phone??"").trim();
    const phone=normalizePhone(rawPhone);
    const fullName=String(body.fullName??"").trim();
    const boutiqueName=String(body.boutiqueName??"").trim();
    let temporaryPassword=String(body.temporaryPassword??"").trim();
    if(phone.length<8||!fullName||!boutiqueName||temporaryPassword.length<12){
      return json({error:"Informations d’onboarding incomplètes"},400);
    }

    const graphHeaders={Authorization:`Bearer ${WHATSAPP_ACCESS_TOKEN}`,"Content-Type":"application/json"};

    async function listTemplates(name:string){
      const response=await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_WABA_ID}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,rejected_reason,components`,
        {headers:graphHeaders},
      );
      const result=await response.json().catch(()=>null);
      if(!response.ok){
        const metaMessage=String(result?.error?.message??"");
        const metaCode=Number(result?.error?.code??0);
        if(metaCode===10){
          throw new Error("Le token Meta n’a pas la permission de gérer les templates WhatsApp. Générez un token avec whatsapp_business_management + whatsapp_business_messaging et donnez au System User un accès complet au compte WhatsApp Business.");
        }
        if(/unsupported get request|does not exist|cannot be loaded due to missing permissions/i.test(metaMessage)){
          throw new Error("Le WHATSAPP_WABA_ID configuré n’est pas accessible avec ce token Meta. Vérifiez que l’ID est bien le WhatsApp Business Account ID et que le System User du token a un accès complet à ce WABA.");
        }
        if(/nonexisting field \(message_templates\).*WhatsAppBusinessPhoneNumber/i.test(metaMessage)){
          throw new Error("WHATSAPP_WABA_ID contient un Phone Number ID. Utilisez le vrai WhatsApp Business Account ID.");
        }
        throw new Error(result?.error?.message??"Lecture des templates WhatsApp impossible");
      }
      return Array.isArray(result?.data)?result.data:[];
    }

    async function ensureTemplate(params:{name:string;category:"UTILITY"|"AUTHENTICATION";components:any[]}){
      const templates=await listTemplates(params.name);
      const approved=templates.find((item:any)=>item?.status==="APPROVED");
      if(approved) return {ready:true,language:String(approved.language||WHATSAPP_TEMPLATE_LANGUAGE_CODE),template:approved};

      const current=templates[0];
      if(current){
        const reason=String(current?.rejected_reason??"").trim();
        return {
          ready:false,
          status:String(current?.status??"UNKNOWN"),
          error:current?.status==="REJECTED"
            ? `Le template WhatsApp "${params.name}" a été rejeté par Meta${reason?` : ${reason}`:"."}`
            : `Le template WhatsApp "${params.name}" est ${current?.status??"en cours de validation"} chez Meta.`,
        };
      }

      const createResponse=await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_WABA_ID}/message_templates`,
        {
          method:"POST",
          headers:graphHeaders,
          body:JSON.stringify({
            name:params.name,
            language:WHATSAPP_TEMPLATE_LANGUAGE_CODE,
            category:params.category,
            components:params.components,
          }),
        },
      );
      const createResult=await createResponse.json().catch(()=>null);
      if(!createResponse.ok){
        if(Number(createResult?.error?.code??0)===10){
          throw new Error("Le token Meta n’a pas la permission de créer les templates WhatsApp. Ajoutez whatsapp_business_management au token et donnez au System User un accès complet au WABA.");
        }
        throw new Error(createResult?.error?.message??`Création du template ${params.name} impossible`);
      }
      return {
        ready:createResult?.status==="APPROVED",
        status:String(createResult?.status??"PENDING"),
        language:WHATSAPP_TEMPLATE_LANGUAGE_CODE,
        error:createResult?.status==="APPROVED"
          ? undefined
          : `Le template WhatsApp "${params.name}" vient d’être soumis à Meta et attend son approbation.`,
      };
    }

    const utility=await ensureTemplate({
      name:WHATSAPP_UTILITY_TEMPLATE_NAME,
      category:"UTILITY",
      components:[{
        type:"BODY",
        text:`Bonjour {{1}}, votre compte Tournal pour {{2}} est prêt. Votre identifiant de connexion est {{3}}. Connectez-vous sur ${TOURNAL_LOGIN_URL}.`,
        example:{body_text:[["Awa Diallo","Boutique GGR","+221781224409"]]},
      }],
    });

    const authTemplate=await ensureTemplate({
      name:WHATSAPP_AUTH_TEMPLATE_NAME,
      category:"AUTHENTICATION",
      components:[
        {type:"BODY",add_security_recommendation:true},
        {type:"BUTTONS",buttons:[{type:"OTP",otp_type:"COPY_CODE",text:"Copier le code"}]},
      ],
    });

    if(!utility.ready||!authTemplate.ready){
      const waiting=[
        !utility.ready?`${WHATSAPP_UTILITY_TEMPLATE_NAME}: ${utility.status??"PENDING"}`:null,
        !authTemplate.ready?`${WHATSAPP_AUTH_TEMPLATE_NAME}: ${authTemplate.status??"PENDING"}`:null,
      ].filter(Boolean);
      const errors=[!utility.ready?utility.error:null,!authTemplate.ready?authTemplate.error:null].filter(Boolean);
      return json({error:errors.join(" "),template_statuses:waiting},409);
    }

    if(!/^[A-Za-z0-9]{12,15}$/.test(temporaryPassword)){
      const {data:target,error:targetError}=await admin.from("platform_users").select("id").eq("phone",rawPhone).maybeSingle();
      if(targetError||!target) return json({error:"Impossible de retrouver le nouveau propriétaire pour régénérer un code WhatsApp compatible."},400);
      temporaryPassword=generateAuthCode();
      const {error:passwordError}=await admin.auth.admin.updateUserById(target.id,{password:temporaryPassword});
      if(passwordError) return json({error:passwordError.message},400);
      const {error:flagError}=await admin.from("platform_users").update({must_change_password:true}).eq("id",target.id);
      if(flagError) return json({error:flagError.message},400);
    }

    async function registerSender(){
      if(!/^\d{6}$/.test(WHATSAPP_REGISTRATION_PIN)) throw new Error("Numéro WhatsApp non enregistré. Ajoutez WHATSAPP_REGISTRATION_PIN (6 chiffres) dans les secrets Supabase.");
      const response=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/register`,{
        method:"POST",
        headers:graphHeaders,
        body:JSON.stringify({messaging_product:"whatsapp",pin:WHATSAPP_REGISTRATION_PIN}),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(result?.error?.message??"Enregistrement du numéro WhatsApp impossible");
    }

    async function sendTemplate(payload:any){
      let response=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,{
        method:"POST",
        headers:graphHeaders,
        body:JSON.stringify(payload),
      });
      let result=await response.json().catch(()=>null);
      if(!response.ok&&Number(result?.error?.code)===133010){
        await registerSender();
        response=await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,{
          method:"POST",
          headers:graphHeaders,
          body:JSON.stringify(payload),
        });
        result=await response.json().catch(()=>null);
      }
      if(!response.ok) throw new Error(result?.error?.message??"Envoi WhatsApp impossible");
      return result?.messages?.[0]?.id??null;
    }

    const utilityPayload={
      messaging_product:"whatsapp",
      to:phone,
      type:"template",
      template:{
        name:WHATSAPP_UTILITY_TEMPLATE_NAME,
        language:{code:utility.language},
        components:[{
          type:"body",
          parameters:[
            {type:"text",text:fullName},
            {type:"text",text:boutiqueName},
            {type:"text",text:rawPhone},
          ],
        }],
      },
    };
    const authPayload={
      messaging_product:"whatsapp",
      to:phone,
      type:"template",
      template:{
        name:WHATSAPP_AUTH_TEMPLATE_NAME,
        language:{code:authTemplate.language},
        components:[
          {type:"body",parameters:[{type:"text",text:temporaryPassword}]},
          {type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:temporaryPassword}]},
        ],
      },
    };

    const utilityMessageId=await sendTemplate(utilityPayload);
    const authMessageId=await sendTemplate(authPayload);
    return json({ok:true,messageIds:[utilityMessageId,authMessageId].filter(Boolean),temporaryPassword});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Erreur interne"},500);
  }
});
