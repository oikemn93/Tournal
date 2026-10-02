import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/whatsapp-onboarding/index.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import .*\r?\n/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function run({ frenchStatus = 'APPROVED', authStatus = 'APPROVED', authenticated = true } = {}) {
  const sent = [];
  const writes = [];
  let handler;
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test',
    WHATSAPP_ACCESS_TOKEN: 'test', WHATSAPP_PHONE_NUMBER_ID: 'test', WHATSAPP_WABA_ID: 'test' };
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }),
      admin: { updateUserById: async () => { writes.push('password'); return {}; } } },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_super_admin: true } }) }) }) }),
  };
  vm.runInNewContext(code, {
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    createClient: () => admin, Response, crypto,
    fetch: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/message_templates') && !options.method) {
        const name = parsed.searchParams.get('name');
        const status = name === 'tournal_account_ready_v1' ? frenchStatus : authStatus;
        return Response.json({ data: [
          { name: 'unrelated', status: 'APPROVED', language: 'fr' },
          { name, status: 'APPROVED', language: 'en' },
          { name, status, language: 'fr' },
        ] });
      }
      if (parsed.pathname.endsWith('/messages')) {
        sent.push(JSON.parse(options.body));
        return Response.json({ messages: [{ id: `message-${sent.length}` }] });
      }
      throw new Error(`Unexpected external request: ${options.method} ${parsed.pathname}`);
    },
  });
  const result = await handler(new Request('https://example.invalid', {
    method: 'POST', headers: authenticated ? { Authorization: 'Bearer test' } : {},
    body: JSON.stringify({ phone: '+221770000000', fullName: 'Awa', boutiqueName: 'Exemple', temporaryPassword: 'Abcdefgh123456' }),
  }));
  return { status: result.status, body: await result.json(), sent, writes };
}

const success = await run();
assert.equal(success.status, 200);
assert.equal(success.sent.length, 2);
assert.deepEqual(success.sent[0].template.components[0].parameters, [
  { type: 'text', text: 'Awa' }, { type: 'text', text: 'Exemple' },
]);
assert.ok(success.sent.every(message => message.template.language.code === 'fr'));

for (const options of [{ frenchStatus: 'PENDING' }, { authStatus: 'REJECTED' }]) {
  const result = await run(options);
  assert.equal(result.status, 409);
  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.writes, []);
}
const unauthenticated = await run({ authenticated: false });
assert.equal(unauthenticated.status, 401);
assert.deepEqual(unauthenticated.sent, []);
console.log('WhatsApp: two parameters, exact French selection, pending/rejected gate and authentication checks passed.');
