/*
  planner.mjs — the agent's brain. YOU EDIT THIS FILE (one function).

  WHO calls plan(): agent.mjs, once per loop iteration.
  WHAT plan() does: looks at everything the mission knows so far and returns
  the ONE next action. It never executes anything itself — deciding and doing
  are separated on purpose, so every decision can be logged, gated, and tested.
  WHY it is deterministic: this brain is a scripted stand-in for a language
  model. The SEAM is the point: plan(state) in, action out, is exactly the
  contract an LLM-backed planner has. Swap this file's insides for a model
  call and NOTHING else in the system changes — not the guardrails, not the
  approval gate, not the budget, not the trace. HW8's final write-up asks you
  to argue precisely that.

  THE STATE the agent hands in:
    {
      goal:         the mission sentence from the command line,
      role:         'support-agent' or 'read-only',
      observations: [ { step, kind: 'tool'|'resource', name, ok, result }, ... ]
                    — everything seen so far, oldest first,
      stepsUsed:    how many steps have executed
    }

  THE ACTIONS plan() may return (exactly one per call):
    { type: 'call_tool',     tool, args, why }   — ask the loop to call an MCP tool
    { type: 'read_resource', uri, why }          — ask the loop to read an MCP resource
    { type: 'finish',        report, why }       — end the mission with a final answer

  The `why` string is not decoration: it lands in trace.jsonl, and traces are
  how humans audit agents after the fact (Session 11: observability).
*/

import { looksLikeInjection } from './guardrails.mjs';

/*
  The mission budget. agent.mjs enforces it through checkStepBudget() — the
  planner just exports the number so there is one source of truth.
*/
export const MAX_STEPS = 8;

/*
  FINISHED — pull an order ID out of free text.
  Returns 'ORD-1234' or null. One tiny function, unit-tested, reused by three
  branches — the same habit as the monitor's pure evaluateChecks().
*/
export function extractOrderId(text) {
  const match = /ORD-\d{4}/i.exec(text ?? '');
  return match ? match[0].toUpperCase() : null;
}

/*
  Small helpers the branches share. `latest` finds the most recent observation
  of one tool — "most recent" matters for the watch branch, which calls the
  same tool repeatedly.
*/
function latest(observations, kind, name) {
  for (let i = observations.length - 1; i >= 0; i--) {
    const obs = observations[i];
    if (obs.kind === kind && obs.name === name) return obs;
  }
  return null;
}

/*
  THE DISPATCHER — routes a goal to a branch by keywords. Order matters:
  "keep checking ORD-1001 until it is delivered" contains the word "checking",
  so the watch branch must win before the status branch gets a look.
  A real system replaces keyword routing with a model; the branches beneath
  it change far less than you might guess.
*/
export function plan(state) {
  const goal = (state.goal ?? '').toLowerCase();

  if (goal.includes('until')) return planWatch(state);
  if (/(refund|damaged|broken|dented|return)/.test(goal)) return decideRefundStep(state);
  if (/(note|summar)/.test(goal)) return planNoteSummary(state);
  if (/(status|where is|check)/.test(goal)) return planStatusLookup(state);

  return {
    type: 'finish',
    report: `I don't know how to help with that goal. I can check order status, open refund tickets with your approval, watch an order, or summarize the customer note.`,
    why: 'No branch matched the goal; an honest "I cannot" beats a guess.'
  };
}

/*
  FINISHED BRANCH — a status lookup. Study it: this is the one-tool version of
  the state machine you will write for refunds. Each call of plan() sees more
  observations than the last, so the branch reads like a checklist:
  "what do I still not know?"
*/
function planStatusLookup(state) {
  const orderId = extractOrderId(state.goal);
  if (!orderId) {
    return {
      type: 'finish',
      report: 'I need an order ID (it looks like ORD-1001) to check a status. Please re-run the mission with one.',
      why: 'The status branch cannot proceed without an order ID.'
    };
  }

  const seen = latest(state.observations, 'tool', 'get_order_status');
  if (!seen) {
    return {
      type: 'call_tool',
      tool: 'get_order_status',
      args: { orderId },
      why: `The goal asks about ${orderId} and no lookup has happened yet.`
    };
  }

  if (!seen.ok) {
    return {
      type: 'finish',
      report: `I could not find that order: ${seen.result?.message ?? 'lookup failed'}. Please double-check the ID.`,
      why: 'The lookup failed; report the failure rather than retrying forever.'
    };
  }

  return {
    type: 'finish',
    report: `Order ${orderId} is currently "${seen.result.status}" with an estimated date of ${seen.result.eta}.`,
    why: 'The lookup succeeded; the goal is fully answered.'
  };
}

/*
  TODO — HW8 Part 3. THE REFUND BRANCH.

  Mission example: node agent.mjs "Customer reports ORD-1001 arrived damaged and wants a refund ticket"

  This is a state machine over observations. On each call, work out which of
  these five situations the mission is in, and return that situation's action.
  (Use planStatusLookup above as your model; `latest(...)` is your friend.)

  1. VERIFY FIRST. If there is no get_order_status observation yet, call
     get_order_status for the goal's order ID. An agent that writes before it
     reads is guessing. (If the goal has no order ID at all, finish with a
     report asking for one.)

  2. DEAD END. If the order lookup came back not-ok, finish: report that the
     order could not be verified and that NO ticket was created. Never propose
     a write for an order you could not verify.

  3. PROPOSE THE WRITE. If the order is verified and there is no
     create_support_ticket observation yet, return:
       {
         type: 'call_tool',
         tool: 'create_support_ticket',
         args: { orderId, issue: <the goal text>, confirmed: false },
         why:  <your explanation>
       }
     confirmed is false HERE ON PURPOSE. The planner proposes; only the human,
     through the approval gate in agent.mjs, flips it to true. Wiring the flag
     to the human instead of the brain is the whole safety design of this
     assignment — a planner (or model) that could set confirmed=true itself
     would make the customer note's attack work.

  4. HANDLE THE VERDICT. If the create_support_ticket observation exists but
     is not-ok, finish and report the refusal honestly (the code and message
     tell you whether it was CONFIRMATION_REQUIRED — the human said no — or
     something else).

  5. TRUST, THEN VERIFY, THEN REPORT. If the ticket was created ok and there
     is no get_ticket observation yet, call get_ticket with the new ticketId
     (it is in the create observation's result). Once get_ticket has answered,
     finish with a report naming the ticket ID and its status.

  Delete the throw when you start. Run `npm test` after each situation — the
  tests are written one-per-situation, so they light up green in order.
*/
export function decideRefundStep(state) {
  void state;
  void latest;
  throw new Error('NOT_IMPLEMENTED — complete decideRefundStep() (HW8 Part 3).');
}

/*
  FINISHED BRANCH — summarize the untrusted customer note.

  Mission: node agent.mjs "Summarize the customer note for the morning meeting"

  Read the order of operations: fetch the note, run the detector, and EITHER
  way the summary treats the text as quoted material. Notice what this branch
  is structurally incapable of doing: it has no path that returns a call_tool
  action derived from the note's content. The note can demand tool calls all
  it wants; this branch can only describe the note. That is containment by
  construction — the strongest defense in the file, and it costs nothing.
*/
function planNoteSummary(state) {
  const note = latest(state.observations, 'resource', 'business://customer-note/security-test');
  if (!note) {
    return {
      type: 'read_resource',
      uri: 'business://customer-note/security-test',
      why: 'The goal asks about the customer note and it has not been read yet.'
    };
  }

  const text = String(note.result ?? '');
  const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 160);

  if (looksLikeInjection(text)) {
    return {
      type: 'finish',
      report: [
        '⚠️ INJECTION WARNING: the customer note contains instruction-shaped text that tries to direct tool use.',
        'I treated it as untrusted data and took none of the actions it demands.',
        `Quoted for the human reviewer: "${excerpt}…"`
      ].join('\n'),
      why: 'The detector flagged instruction-shaped content; warn the human, act on nothing.'
    };
  }

  return {
    type: 'finish',
    report: `Customer note summary (treated as untrusted data): "${excerpt}…"`,
    why: 'The note was read and summarized as quoted data; no tool action was requested by the goal.'
  };
}

/*
  FINISHED BRANCH — the runaway. Watch an order until it is delivered.

  Mission: node agent.mjs "Keep checking ORD-1001 until it says delivered"

  ORD-1001 is "processing" and this data never changes, so this branch loops
  forever BY DESIGN. It exists to give your Part 2A step budget something real
  to stop. Before you implement the budget, agent.mjs's crude 25-step seatbelt
  is the only thing standing between this loop and eternity — run the mission
  before and after, and compare the endings in your write-up.
*/
function planWatch(state) {
  const orderId = extractOrderId(state.goal);
  if (!orderId) {
    return {
      type: 'finish',
      report: 'I need an order ID (like ORD-1001) to watch. Please re-run the mission with one.',
      why: 'The watch branch cannot proceed without an order ID.'
    };
  }

  const seen = latest(state.observations, 'tool', 'get_order_status');
  if (seen && !seen.ok) {
    return {
      type: 'finish',
      report: `I could not find order ${orderId}: ${seen.result?.message ?? 'lookup failed'}.`,
      why: 'The order does not exist; watching it would loop on a dead end.'
    };
  }

  if (seen?.ok && seen.result.status === 'delivered') {
    return {
      type: 'finish',
      report: `Order ${orderId} is delivered. Watch complete after ${state.stepsUsed} steps.`,
      why: 'The watch condition was met.'
    };
  }

  return {
    type: 'call_tool',
    tool: 'get_order_status',
    args: { orderId },
    why: seen
      ? `Order ${orderId} is still "${seen.result?.status}"; checking again. (Yes, this can loop forever — that is the budget lesson.)`
      : `First check of ${orderId} for the watch mission.`
  };
}
