import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanupActivatedConnectorBackup
} from '../electron/connector-install-policy.ts';

test('activated connector cleanup succeeds without a deferred error', async () => {
  let cleaned = false;
  const result = await cleanupActivatedConnectorBackup(async () => {
    cleaned = true;
  });

  assert.equal(cleaned, true);
  assert.deepEqual(result, { cleaned: true, error: '' });
});

test('a locked backup is deferred instead of failing activation', async () => {
  const locked = new Error(
    'EPERM: operation not permitted, unlink AwooNcmCefBridge.dll'
  );
  const result = await cleanupActivatedConnectorBackup(async () => {
    throw locked;
  });

  assert.deepEqual(result, {
    cleaned: false,
    error: locked.message
  });
});
