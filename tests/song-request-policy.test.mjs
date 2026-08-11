import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasPendingSongRequestByUser,
  normalizeUserIdList,
  userIdInList
} from '../electron/song-request-policy.ts';

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

test('matches whitelist user ids across numeric and string values', () => {
  assert.equal(userIdInList('1001', [1001, '1002']), true);
  assert.equal(userIdInList(1003, ['1001', '1002']), false);
});

test('normalizes whitelist entries to numeric user ids', () => {
  const normalized = normalizeUserIdList(['1001', 'alice', 1002, '1001', '', null, undefined]);

  assert.deepEqual(normalized, ['1001', '1002']);
  assert.equal(userIdInList('alice', normalized), false);
});
