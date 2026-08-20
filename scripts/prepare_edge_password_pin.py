from pathlib import Path

p = Path('supabase/functions/admin-provision/index.ts')
s = p.read_text()

if 'const passwordOk=' not in s:
    anchor = '''function initialsOf(name: string): string {\n  return String(name ?? "").trim().split(/\\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase();\n}\n'''
    if anchor not in s:
        raise SystemExit('initials helper anchor missing')
    s = s.replace(anchor, anchor + 'const passwordOk=(v:unknown)=>String(v??"").length>=12;\n', 1)

s = s.replace(
    'if (!phone || !fullName || !password) return json({ error:"Champs requis manquants" },400);',
    'if (!phone || !fullName || !passwordOk(password)) return json({ error:"Nom, téléphone et mot de passe temporaire d’au moins 12 caractères requis" },400);',
    1,
)
s = s.replace(
    'const payload={ id:uid,phone,nom:fullName,initials:initialsOf(fullName),color,is_super_admin:false,is_suspended:false };',
    'const payload={ id:uid,phone,nom:fullName,initials:initialsOf(fullName),color,is_super_admin:false,is_suspended:false,must_change_password:true };',
    1,
)
s = s.replace(
    'if (!userId || !password) return json({error:"Champs requis manquants"},400);',
    'if (!userId || !passwordOk(password)) return json({error:"Utilisateur et mot de passe temporaire d’au moins 12 caractères requis"},400);',
    1,
)
reset_anchor = '''      const { error }=await admin.auth.admin.updateUserById(userId,{password});\n      if (error) return json({error:error.message},400);\n      return json({ok:true});'''
reset_new = '''      const { error }=await admin.auth.admin.updateUserById(userId,{password});\n      if (error) return json({error:error.message},400);\n      const { error:profileResetError }=await admin.from("platform_users").update({must_change_password:true}).eq("id",userId);\n      if (profileResetError) return json({error:profileResetError.message},400);\n      return json({ok:true});'''
if reset_anchor in s:
    s = s.replace(reset_anchor, reset_new, 1)

required = [
    'const passwordOk=',
    'must_change_password:true',
    'mot de passe temporaire d’au moins 12 caractères requis',
    'profileResetError',
]
for needle in required:
    if needle not in s:
        raise SystemExit(f'missing edge password/PIN separation fragment: {needle}')

p.write_text(s)
print('edge source prepared for password/PIN separation')
