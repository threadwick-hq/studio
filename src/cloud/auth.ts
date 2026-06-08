// Thin, UI-agnostic wrappers over Supabase Auth. Every call is a safe no-op (or
// throws a clear error) when cloud is disabled, so importing this module never
// has side effects on the local-only build.
import type { Provider, Session } from '@supabase/supabase-js';
import { supabase } from './client';

export type { Session };
// Google is a native Supabase provider; 'ravelry' is a Supabase *custom* OAuth2
// provider configured in the dashboard, so it isn't in the built-in union.
export type OAuthProvider = 'ravelry' | 'google';

// Supabase provider ids. A custom OAuth provider's id must start with `custom:`
// and match the identifier set in the dashboard (Auth → Providers → Manual).
const PROVIDER_ID: Record<OAuthProvider, string> = {
  ravelry: 'custom:ravelry',
  google: 'google',
};

function client() {
  if (!supabase) throw new Error('Cloud is not configured.');
  return supabase;
}

// Redirect target for OAuth / magic links: a single canonical app URL (no query
// or hash) so it matches one Supabase allow-list entry wherever sign-in started.
function redirectTo(): string {
  return window.location.origin + window.location.pathname;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider: PROVIDER_ID[provider] as Provider,
    options: { redirectTo: redirectTo() },
  });
  if (error) throw error;
}

// Returning users: the authenticator resolves the account (discoverable creds),
// so no email/username is typed.
export async function signInWithPasskey(): Promise<void> {
  const { error } = await client().auth.signInWithPasskey();
  if (error) throw error;
}

// Passkey-first sign-up. Supabase's passkey beta requires a session before a
// passkey can be registered, so we bootstrap an anonymous user (invisible to the
// person), bind the passkey to it, then invite them to add a backup email. The
// account is real immediately; the email upgrade makes it recoverable.
export async function createAccountWithPasskey(): Promise<void> {
  const sb = client();
  const anon = await sb.auth.signInAnonymously();
  if (anon.error) throw anon.error;
  // If the passkey ceremony fails or is cancelled, roll back the anonymous
  // session we just created so we don't strand a credential-less account.
  try {
    const reg = await sb.auth.registerPasskey();
    if (reg.error) throw reg.error;
  } catch (e) {
    await sb.auth.signOut();
    throw e;
  }
}

// Add a passkey to the account that's already signed in (e.g. after OAuth/email).
export async function registerPasskey(): Promise<void> {
  const { error } = await client().auth.registerPasskey();
  if (error) throw error;
}

// Attach (or change) the backup email. Supabase emails a confirmation link; once
// confirmed it can receive magic-link sign-ins as the passkey fallback.
export async function addBackupEmail(email: string): Promise<void> {
  const { error } = await client().auth.updateUser({ email });
  if (error) throw error;
}

// Backup login: email the user a one-time sign-in link.
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signUp({
    email, password, options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
