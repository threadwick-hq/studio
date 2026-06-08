// Supabase calls this as Ravelry's OAuth2 "UserInfo URL". Ravelry's
// current_user.json nests the user under a `user` object with no top-level
// `sub`, which trips supabase/auth#2519 ("missing provider id") for custom
// OAuth2 providers — Supabase drops non-`sub` fields and can't key the identity.
// This proxy forwards the access token to Ravelry and returns a flattened object
// with a top-level `sub`, which Supabase maps cleanly.
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const authorization = req.headers.get('authorization');
  if (!authorization) return json({ error: 'missing authorization header' }, 401);

  const res = await fetch('https://api.ravelry.com/current_user.json', {
    headers: { authorization, accept: 'application/json' },
  });
  if (!res.ok) return json({ error: 'ravelry userinfo request failed', status: res.status }, 502);

  const body = (await res.json()) as { user?: { id?: number | string; username?: string } };
  const user = body.user;
  if (!user || user.id == null) return json({ error: 'ravelry returned no user' }, 502);

  return json({
    sub: String(user.id),
    name: user.username ?? null,
    preferred_username: user.username ?? null,
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
