from pathlib import Path

p = Path('supabase/functions/admin-provision/index.ts')
s = p.read_text()

s = s.replace(
    '.select("id,is_super_admin,is_suspended").eq("id",caller.id).single();',
    '.select("id,is_super_admin,is_suspended,must_change_password").eq("id",caller.id).single();',
    1,
)
caller_anchor = '    if (callerPlatform.is_suspended) return json({ error:"Compte suspendu" },403);\n'
caller_guard = caller_anchor + '    if (callerPlatform.must_change_password) return json({ error:"Changement de mot de passe requis" },403);\n'
if 'callerPlatform.must_change_password' not in s:
    if caller_anchor not in s:
        raise SystemExit('caller guard anchor missing')
    s = s.replace(caller_anchor, caller_guard, 1)

s = s.replace(
    '.upsert(payload,{onConflict:"id",ignoreDuplicates:true});',
    '.upsert(payload,{onConflict:"id"});',
    1,
)

required = [
    'is_suspended,must_change_password',
    'if (callerPlatform.must_change_password)',
    '.upsert(payload,{onConflict:"id"});',
]
for needle in required:
    if needle not in s:
        raise SystemExit(f'missing final edge hardening fragment: {needle}')
if 'ignoreDuplicates:true' in s:
    raise SystemExit('unsafe ignoreDuplicates remains in user profile upsert')

p.write_text(s)
print('edge activation flow hardened')
