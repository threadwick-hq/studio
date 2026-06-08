// Pure unit tests for the cloud groundwork. No Supabase, no network, no DOM — so
// these run in the existing hermetic vitest harness alongside the core tests.
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { uid } from '../src/core/util';
import { cloudEnabled } from '../src/cloud/config';
import { supabase } from '../src/cloud/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Cloud is strictly env-gated: the flag mirrors the presence of the Supabase env
// vars, and the client exists only when the flag is on. With no env (local/CI)
// that means cloud is OFF and the app is the unchanged local-only studio; with
// env set (e.g. the Vercel build) it's ON. The invariant holds either way.
test('cloud flag mirrors env, and the client matches the flag', () => {
  const hasEnv = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  assert.equal(cloudEnabled, hasEnv);
  assert.equal(supabase === null, !hasEnv);
});

test('uid: prefixed, uuid-shaped', () => {
  assert.match(uid('prj'), new RegExp('^prj_' + UUID.source.slice(1)));
  assert.match(uid(), new RegExp('^id_' + UUID.source.slice(1)));
});

test('uid: collision-resistant across many calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10000; i++) seen.add(uid('x'));
  assert.equal(seen.size, 10000);
});
