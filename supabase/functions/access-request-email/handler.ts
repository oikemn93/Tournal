type Config = { url: string; serviceKey: string };

async function authorized(req: Request, config: Config, request: typeof fetch) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || header.length > 256) return false;
  const secret = header.slice(7).trim();
  if (secret.length < 32) return false;
  try {
    const response = await request(`${config.url}/rest/v1/rpc/access_email_authorized`, {
      method: 'POST',
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_secret: secret }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    return await response.json() === true;
  } catch {
    return false;
  }
}

export function createHandler(config: Config, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const reply = (value: unknown, status = 200) => Response.json(value, {
      status, headers: { 'Cache-Control': 'no-store' },
    });
    if (req.method !== 'POST') return reply({ error: 'method' }, 405);
    if (!config.url || !config.serviceKey) return reply({ error: 'unavailable' }, 503);
    if (!await authorized(req, config, request)) return reply({ error: 'unauthorized' }, 401);
    try {
      const reader = req.body?.getReader();
      if (!reader) return reply({ error: 'body' }, 400);
      let text = '', size = 0;
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024) { await reader.cancel(); return reply({ error: 'size' }, 413); }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }

      let body: Record<string, unknown>;
      try { body = JSON.parse(text); } catch { return reply({ error: 'body' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'body' }, 400);

      let rpc: string;
      let args: object;
      if (body.action === 'claim') {
        rpc = 'access_email_claim';
        args = {};
      } else if (body.action === 'complete') {
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (
          typeof body.id !== 'string' || !uuid.test(body.id) ||
          typeof body.lease !== 'string' || !uuid.test(body.lease) ||
          typeof body.success !== 'boolean'
        ) return reply({ error: 'body' }, 400);
        rpc = 'access_email_complete';
        args = { p_id: body.id, p_lease: body.lease, p_success: body.success };
      } else {
        return reply({ error: 'action' }, 400);
      }

      const result = await request(`${config.url}/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) return reply({ error: 'database' }, 502);
      return reply(await result.json());
    } catch {
      return reply({ error: 'unavailable' }, 503);
    }
  };
}
