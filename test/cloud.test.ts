// Pure unit tests for the cloud groundwork. No Supabase, no network, no DOM — so
// these run in the existing hermetic vitest harness alongside the core tests.
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { uid } from '../src/core/util';
import { cloudEnabled } from '../src/cloud/config';
import { supabase } from '../src/cloud/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The core safety guarantee of the auth-shell milestone: with no Supabase env
// vars configured (the default, and today's production), cloud is entirely off —
// no client, nothing to read or write the local library.
test('cloud is OFF by default — local-only app is unchanged', () => {
  assert.equal(cloudEnabled, false);
  assert.equal(supabase, null);
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
