// An OAuth provider (or Supabase) reports failures by appending error params to
// the callback URL. Capture them synchronously at startup — before supabase-js's
// detectSessionInUrl strips the URL — so the UI can show the real reason instead
// of silently landing the user back signed-out. Errors arrive in the query
// and/or the hash fragment.
function pick(qs: string): string | null {
  const p = new URLSearchParams(qs);
  return p.get('error_description') ?? p.get('error');
}

let pending = pick(window.location.search) ?? pick(window.location.hash.replace(/^#/, ''));

// Return the captured error at most once, and scrub it from the address bar.
export function takeOAuthError(): string | null {
  const e = pending;
  pending = null;
  if (e) {
    const clean = window.location.origin + window.location.pathname;
    if (window.location.href !== clean) window.history.replaceState({}, '', clean);
  }
  return e;
}
