import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPendingSongRequestByUser } from '../electron/song-request-policy.ts';

test('allows a user with no active or queued requests', () => {
  assert.equal(hasPendingSongRequestByUser('1001', [], null), false);
});

test('blocks a user when their song is still waiting in the queue', () => {
  assert.equal(hasPendingSongRequestByUser(
    '1001',
    [
      { OrderedByUid: '1002' },
      { OrderedByUid: '1001' }
    ],
    null
  ), true);
});

test('blocks a user when their requested song is currently playing', () => {
  assert.equal(hasPendingSongRequestByUser(
    '1001',
    [],
    { OrderedByUid: '1001' }
  ), true);
});

test('compares numeric and string user ids consistently', () => {
  assert.equal(hasPendingSongRequestByUser(
    1001,
    [{ OrderedByUid: '1001' }],
    null
  ), true);
});
