/*
  agent.test.mjs — executable requirements for the guardrails and the planner.

  Everything tested here is a PURE function: no MCP server, no network, no
  approval prompts. That is the payoff of separating deciding (planner),
  permitting (guardrails), and doing (agent loop): the safety-critical parts
  test in milliseconds.

  Run with: npm test        (which runs: node --test agent.test.mjs)

  EXPECTED BASELINE on the unchanged starter: tests 16, pass 10, fail 6.
  The six failures are your assignment: two guardrail stubs (Part 2) and the
  refund branch (Part 3). Do not edit the tests to make a broken
  implementation look correct.
*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkToolAllowed,
  checkStepBudget,
  requiresApproval,
  looksLikeInjection
} from './guardrails.mjs';
import { plan, decideRefundStep, extractOrderId, MAX_STEPS } from './planner.mjs';
import { MemorySupportStore } from './memory-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// A tiny helper to build planner state without repeating the shape everywhere.
function state(goal, observations = [], role = 'support-agent') {
  return { goal, role, observations, stepsUsed: observations.length };
}

// ---------- least privilege (finished examples — should pass from day one) ----------

test('read-only role may call read tools', () => {
  assert.equal(checkToolAllowed('read-only', 'get_order_status').ok, true);
  assert.equal(checkToolAllowed('read-only', 'get_ticket').ok, true);
});

test('read-only role is blocked from the write tool with TOOL_NOT_ALLOWED', () => {
  const verdict = checkToolAllowed('read-only', 'create_support_ticket');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'TOOL_NOT_ALLOWED');
});

test('only write tools require human approval', () => {
  assert.equal(requiresApproval('create_support_ticket'), true);
  assert.equal(requiresApproval('get_order_status'), false);
  assert.equal(requiresApproval('get_ticket'), false);
});

// ---------- the step budget (Part 2A — fails until implemented) ----------

test('the budget allows steps below the limit', () => {
  assert.equal(checkStepBudget(0, MAX_STEPS).ok, true);
  assert.equal(checkStepBudget(MAX_STEPS - 1, MAX_STEPS).ok, true);
});

test('the budget refuses at and beyond the limit with STEP_BUDGET_EXHAUSTED', () => {
  const atLimit = checkStepBudget(MAX_STEPS, MAX_STEPS);
  assert.equal(atLimit.ok, false);
  assert.equal(atLimit.code, 'STEP_BUDGET_EXHAUSTED');
  const beyond = checkStepBudget(MAX_STEPS + 5, MAX_STEPS);
  assert.equal(beyond.ok, false);
});

// ---------- the injection detector (Part 2B — fails until implemented) ----------

test('the detector flags the shipped customer note as instruction-shaped', async () => {
  const note = await readFile(path.join(here, 'data', 'customer-note.txt'), 'utf8');
  assert.equal(looksLikeInjection(note), true);
});

test('the detector leaves an ordinary complaint alone', () => {
  const innocent = 'My box arrived dented and I am unhappy. Please help me figure out what to do next.';
  assert.equal(looksLikeInjection(innocent), false);
});

// ---------- the status branch (finished example — should pass from day one) ----------

test('a status goal starts with a get_order_status call for the extracted ID', () => {
  const action = plan(state('What is the status of order ORD-1001?'));
  assert.equal(action.type, 'call_tool');
  assert.equal(action.tool, 'get_order_status');
  assert.deepEqual(action.args, { orderId: 'ORD-1001' });
});

test('a status goal finishes with the status once the lookup succeeds', () => {
  const action = plan(state('What is the status of order ORD-1001?', [
    { step: 0, kind: 'tool', name: 'get_order_status', ok: true, result: { ok: true, orderId: 'ORD-1001', status: 'processing', eta: '2026-07-22' } }
  ]));
  assert.equal(action.type, 'finish');
  assert.match(action.report, /processing/);
});

// ---------- the refund branch (Part 3 — fails until implemented) ----------

const REFUND_GOAL = 'Customer reports ORD-1001 arrived damaged and wants a refund ticket';

test('refund step 1: verify the order before anything else', () => {
  const action = decideRefundStep(state(REFUND_GOAL));
  assert.equal(action.type, 'call_tool');
  assert.equal(action.tool, 'get_order_status');
  assert.deepEqual(action.args, { orderId: 'ORD-1001' });
});

test('refund step 2: a failed lookup ends the mission without ever proposing a write', () => {
  const action = decideRefundStep(state('Customer reports ORD-9999 arrived damaged and wants a refund ticket', [
    { step: 0, kind: 'tool', name: 'get_order_status', ok: false, result: { ok: false, code: 'ORDER_NOT_FOUND', message: 'No order exists with ID ORD-9999.' } }
  ]));
  assert.equal(action.type, 'finish');
  assert.doesNotMatch(JSON.stringify(action), /create_support_ticket/);
});

test('refund step 3: a verified order leads to a ticket proposal with confirmed:false', () => {
  const action = decideRefundStep(state(REFUND_GOAL, [
    { step: 0, kind: 'tool', name: 'get_order_status', ok: true, result: { ok: true, orderId: 'ORD-1001', status: 'processing', eta: '2026-07-22' } }
  ]));
  assert.equal(action.type, 'call_tool');
  assert.equal(action.tool, 'create_support_ticket');
  assert.equal(action.args.orderId, 'ORD-1001');
  assert.equal(action.args.confirmed, false, 'the planner must NEVER set confirmed:true — only the human approval gate does that');
  assert.equal(typeof action.args.issue, 'string');
  assert.ok(action.args.issue.length >= 10, 'the issue text must satisfy the tool schema minimum');
});

test('refund step 5a: a created ticket is verified with get_ticket', () => {
  const action = decideRefundStep(state(REFUND_GOAL, [
    { step: 0, kind: 'tool', name: 'get_order_status', ok: true, result: { ok: true, orderId: 'ORD-1001', status: 'processing', eta: '2026-07-22' } },
    { step: 1, kind: 'tool', name: 'create_support_ticket', ok: true, result: { ok: true, ticketId: 'TKT-AB12CD34', orderId: 'ORD-1001', status: 'open' } }
  ]));
  assert.equal(action.type, 'call_tool');
  assert.equal(action.tool, 'get_ticket');
  assert.deepEqual(action.args, { ticketId: 'TKT-AB12CD34' });
});

// ---------- the server-side boundary (finished — defense in depth, should pass) ----------

test('the store refuses an unconfirmed write no matter who asks', () => {
  const store = new MemorySupportStore({ orders: [{ orderId: 'ORD-1001', status: 'processing', eta: '2026-07-22' }] });
  const verdict = store.createSupportTicket({ orderId: 'ORD-1001', issue: 'Board arrived dented on the rail.', confirmed: false });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'CONFIRMATION_REQUIRED');
});

test('the store refuses a confirmed write for an order that does not exist', () => {
  const store = new MemorySupportStore({ orders: [{ orderId: 'ORD-1001', status: 'processing', eta: '2026-07-22' }] });
  const verdict = store.createSupportTicket({ orderId: 'ORD-9999', issue: 'Board arrived dented on the rail.', confirmed: true });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'ORDER_NOT_FOUND');
});

// A tiny bonus check used by three branches — keep it honest.
test('extractOrderId finds IDs regardless of case and returns null when absent', () => {
  assert.equal(extractOrderId('where is ord-1002 please'), 'ORD-1002');
  assert.equal(extractOrderId('no id here'), null);
});
