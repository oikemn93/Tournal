interface Env { ASSETS: { fetch(request: Request): Promise<Response> } }

async function documentShare(token: string, request: Request): Promise<Response> {
  // This public endpoint validates its share token in the existing Supabase function.
  const upstream = new URL('https://cnxtylngddwmhugxkzju.supabase.co/functions/v1/document-share');
  upstream.searchParams.set('token', token);
  const incoming = new URL(request.url);
  // Preserve only the existing document format selector, never credentials.
  if (incoming.searchParams.has('format')) upstream.searchParams.set('format', incoming.searchParams.get('format')!);
  try {
    const response = await fetch(upstream, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response('Document temporairement indisponible. Réessayez plus tard.', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const match = /^\/d\/([^/]+)$/.exec(path);
    if (match) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Méthode non autorisée", { status: 405, headers: { Allow: "GET, HEAD" } });
      const response = await documentShare(match[1], request);
      return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }
    return env.ASSETS.fetch(request);
  }
};
