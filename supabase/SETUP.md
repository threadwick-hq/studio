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
- **Ravelry** — add a **custom OAuth2 provider**. Register an app at
  <https://www.ravelry.com/pro/developer> and paste its client id/secret +
  authorize/token/userinfo endpoints. The secret stays in Supabase.
- **Email** — enable email + password and email OTP (magic link).
- **Email confirmations** — enable *Confirm email* and *Secure email change* so a
  backup email added to a passkey/anonymous account must be confirmed before it
  can be used to sign in (stops binding an unverified address).
- **Passkeys** — enable the experimental passkey feature (beta).
- **Anonymous sign-ins** — **enable**. The passkey-first sign-up bootstraps an
  anonymous session before registering the passkey, then upgrades it with a
  backup email.
- **Redirect URLs** — add the deployed Pages URL (under `/threadwick/`) and
  `http://localhost:5173` for dev.

## 4. Provide the env vars
**Local dev:** copy [`.env.example`](../.env.example) to `.env.local` and fill in:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**CI / GitHub Pages:** add the two as repository **Variables** (Settings →
Secrets and variables → Actions → *Variables*; they're public, so Variables not
Secrets), then inject them into the build step of
`.github/workflows/deploy.yml`. This workflow edit must be committed by a user
with the `workflow` permission (it can't be pushed by the OAuth app):

```yaml
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

With the Variables unset the workflow still builds the local-only app, so it's
safe to add the snippet before the Variables exist.
