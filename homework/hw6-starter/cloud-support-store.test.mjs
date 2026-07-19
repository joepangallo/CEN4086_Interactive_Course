import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudSupportStore } from './cloud-support-store.mjs';

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

test('unconfirmed write is denied locally and never reaches AWS', async () => {
  let calls = 0;
  const store = new CloudSupportStore({
    baseUrl: 'https://example.test', token: 'secret',
    fetchImpl: async () => { calls += 1; return fakeResponse(500, {}); }
  });
  const result = await store.createSupportTicket({
    orderId: 'ORD-1001', issue: 'The package has not arrived yet.', confirmed: false
  });
  assert.equal(result.code, 'CONFIRMATION_REQUIRED');
  assert.equal(calls, 0);
});

test('read call uses the configured endpoint and bearer-style demo header', async () => {
  let seen;
  const store = new CloudSupportStore({
    baseUrl: 'https://abc.execute-api.us-east-1.amazonaws.com/', token: 'demo-secret',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return fakeResponse(200, { ok: true, orderId: 'ORD-1002', status: 'shipped' });
    }
  });
  const result = await store.getOrderStatus('ORD-1002');
  assert.equal(result.ok, true);
  assert.equal(seen.url, 'https://abc.execute-api.us-east-1.amazonaws.com/orders/ORD-1002');
  assert.equal(seen.options.headers['x-demo-token'], 'demo-secret');
});

test('AWS authorization and availability failures become honest tool errors', async () => {
  const unauthorized = new CloudSupportStore({
    baseUrl: 'https://example.test', token: 'wrong',
    fetchImpl: async () => fakeResponse(401, { code: 'UNAUTHORIZED', message: 'Invalid demo token.' })
  });
  assert.equal((await unauthorized.getOrderStatus('ORD-1001')).code, 'UNAUTHORIZED');

  const offline = new CloudSupportStore({
    baseUrl: 'https://example.test', token: 'secret',
    fetchImpl: async () => { throw new Error('network down'); }
  });
  assert.equal((await offline.getOrderStatus('ORD-1001')).code, 'SERVICE_UNAVAILABLE');
});

