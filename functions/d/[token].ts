interface Context { params: { token: string }; request: Request }

export async function onRequestGet({ params, request }: Context): Promise<Response> {
  // This public endpoint validates its share token in the existing Supabase function.
  const upstream = new URL('https://cnxtylngddwmhugxkzju.supabase.co/functions/v1/document-share');
  upstream.searchParams.set('token', params.token);
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
