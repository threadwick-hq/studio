# Cloud setup (Supabase)

Cloud features (sign-in now; sync + sharing later) are **opt-in**. With no env
vars the app is the original local-only studio. To turn cloud on:

## 1. Create a Supabase project
Grab the **Project URL** and the **anon (publishable) key** from
*Project Settings → API*. Both are public — Row-Level Security is the security
boundary. **Never** expose the `service_role` key in the client.

## 2. Apply the schema
Run [`schema.sql`](./schema.sql) in the Supabase SQL editor (or `supabase db`).
It creates the `projects` and `shares` tables, RLS policies, the public
`get_share(token)` RPC, and the server-stamped `updated_at` trigger. Phase 1 (the
auth shell) doesn't read or write these yet — they're defined up front.

## 3. Configure Auth providers
*Authentication → Providers / Sign In*:
- **Google** — enable the native provider.
- **Ravelry** — add a **custom OAuth2 provider** (Manual configuration):
  - Register an OAuth 2.0 app with a Ravelry **Pro** account at
    <https://www.ravelry.com/pro/developer> to get a **client id + secret**.
  - **Identifier:** `custom:ravelry` (must start with `custom:`; the app signs in
    via `signInWithOAuth({ provider: 'custom:ravelry' })`).
  - **Authorization URL:** `https://www.ravelry.com/oauth2/auth`
  - **Token URL:** `https://www.ravelry.com/oauth2/token`
  - **UserInfo URL:** `https://threadwick.com/api/ravelry-userinfo` — a proxy in
    this repo (`api/ravelry-userinfo.ts`) that flattens Ravelry's
    `current_user.json` to a top-level `sub`. Required to work around
    supabase/auth#2519 ("missing provider id"), which drops nested/non-`sub`
    userinfo fields; Ravelry's raw `current_user.json` does not work directly.
  - **email_optional:** `true` — Ravelry doesn't expose an email via the API, so
    allow sign-in without one (the backup-email flow covers recovery); map the
    subject claim to the Ravelry user id.
  - Copy the **Callback URL** Supabase shows into the Ravelry app's redirect URIs.
    The client secret stays in Supabase.
- **Email** — enable email + password and email OTP (magic link).
- **Email confirmations** — enable *Confirm email* and *Secure email change* so a
  backup email added to a passkey/anonymous account must be confirmed before it
  can be used to sign in (stops binding an unverified address).
- **Passkeys** — enable the experimental passkey feature (beta).
- **Anonymous sign-ins** — **enable**. The passkey-first sign-up bootstraps an
  anonymous session before registering the passkey, then upgrades it with a
  backup email.
- **Redirect URLs** — set **Site URL** to `https://threadwick.com/studio/` and add
  `http://localhost:5173/studio/` (dev) to the allowlist, plus
  `https://*.vercel.app/studio/` for preview deploys.

## 4. Provide the env vars
**Local dev:** copy [`.env.example`](../.env.example) to `.env.local` and fill in:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**Production (Vercel):** add the two as **Environment Variables** in the Vercel
project (Settings → Environment Variables, Production + Preview). With them unset
Vercel still builds the local-only app, so it's safe to add them anytime.
