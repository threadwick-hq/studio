/// <reference types="vite/client" />

// Cloud is opt-in via these (optional) build-time vars. Both are public: the anon
// key is a publishable key and RLS is the real security boundary.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
