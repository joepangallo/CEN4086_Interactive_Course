import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SupportStore } from './support-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cen4086-hw5-'));
  await cp(path.join(here, 'data'), dir, { recursive: true });
  return {
    dir,
    store: new SupportStore(dir),
    async cleanup() { await rm(dir, { recursive: true, force: true }); }
  };
}

async function ticketCount(dir) {
  return JSON.parse(await readFile(path.join(dir, 'tickets.json'), 'utf8')).length;
}

test('read tool returns a known order and refuses an unknown order', async () => {
  const f = await fixture();
  try {
    const known = await f.store.getOrderStatus('ORD-1002');
    assert.equal(known.ok, true);
    assert.equal(known.orderId, 'ORD-1002');
    assert.equal(typeof known.status, 'string');
    assert.equal(typeof known.eta, 'string');
    assert.equal((await f.store.getOrderStatus('ORD-9999')).code, 'ORDER_NOT_FOUND');
  } finally { await f.cleanup(); }
});

test('write tool requires explicit confirmation and produces no side effect when denied', async () => {
  const f = await fixture();
  try {
    const before = await ticketCount(f.dir);
    const result = await f.store.createSupportTicket({
      orderId: 'ORD-1001',
      issue: 'The shipment has not moved for three days.',
      confirmed: false
    });
    assert.equal(result.code, 'CONFIRMATION_REQUIRED');
    assert.equal(await ticketCount(f.dir), before);
  } finally { await f.cleanup(); }
});

test('write tool verifies that a well-formed order ID really exists', async () => {
  const f = await fixture();
  try {
    const result = await f.store.createSupportTicket({
      orderId: 'ORD-9999',
      issue: 'This plausible-looking order does not exist.',
      confirmed: true
    });
    assert.equal(result.code, 'ORDER_NOT_FOUND');
    assert.equal(await ticketCount(f.dir), 0);
  } finally { await f.cleanup(); }
});

test('approved write creates one ticket and one sanitized audit event', async () => {
  const f = await fixture();
  try {
    const issue = 'Package damaged; contact me at private@example.com.';
    const result = await f.store.createSupportTicket({
      orderId: 'ORD-1003', issue, confirmed: true
    });
    assert.equal(result.ok, true);
    assert.match(result.ticketId, /^TKT-[A-Z0-9]{8}$/);
    assert.equal(result.status, 'open');
    assert.equal(await ticketCount(f.dir), 1);

    const audit = await readFile(path.join(f.dir, 'audit.jsonl'), 'utf8');
    const lines = audit.trim().split('\n');
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]);
    assert.equal(event.event, 'ticket_created');
    assert.equal(event.ticketId, result.ticketId);
    assert.equal(event.orderId, 'ORD-1003');
    assert.ok(event.createdAt);
    assert.equal(audit.includes(issue), false, 'audit log must not copy free-text customer content');
    assert.equal(audit.includes('private@example.com'), false, 'audit log must not leak personal data');
  } finally { await f.cleanup(); }
});
