/*
  guardrails.mjs — the agent's structural safety layer. YOU EDIT THIS FILE.

  WHO calls these functions: agent.mjs, on every step of every mission — and
  planner.mjs, which uses the injection detector when summarizing untrusted text.
  WHAT they are: small, pure functions. No network, no files, no state. That is
  deliberate: a guardrail you can unit-test in isolation is a guardrail you can
  trust in production.
  WHY they exist: an agent's own judgment — whether a scripted planner or a
  frontier model — is a REQUEST-follower, not a boundary. Boundaries live in
  code like this, outside the thing being bounded. (Session 8: assume "but we
  told it not to" will one day fail, and design so the failure is boring.)

  Two functions are finished as worked examples. Two are yours.
*/

/*
  LEAST PRIVILEGE — who may call what.

  A role is the job the agent is running as, chosen by the human who launched
  it (--role on the command line). The allowlist is the complete universe of
  tools each role can ever touch. Anything not listed does not exist for that
  role — the same idea as HW6's least-privilege memo, now enforced in code.
*/
export const ROLE_TOOL_ALLOWLIST = {
  'read-only': ['get_order_status', 'get_ticket'],
  'support-agent': ['get_order_status', 'get_ticket', 'create_support_ticket']
};

/*
  FINISHED EXAMPLE — study the shape, you will reuse it below.

  Every guardrail answers with the same envelope the tools use:
    { ok: true }                                → proceed
    { ok: false, code: '...', message: '...' }  → refuse, with a reason
  Uniform envelopes mean the agent loop handles every refusal the same way.
*/
export function checkToolAllowed(role, toolName) {
  const allowed = ROLE_TOOL_ALLOWLIST[role];
  if (!allowed) {
    return {
      ok: false,
      code: 'UNKNOWN_ROLE',
      message: `No allowlist exists for role "${role}". Unknown roles get nothing, not everything.`
    };
  }
  if (!allowed.includes(toolName)) {
    return {
      ok: false,
      code: 'TOOL_NOT_ALLOWED',
      message: `Role "${role}" may not call ${toolName}. Allowed: ${allowed.join(', ')}.`
    };
  }
  return { ok: true };
}

/*
  FINISHED — which tools change the world.

  Reads are cheap to forgive; writes are not. Any tool in this set must pass
  through the human approval gate in agent.mjs before it executes. If Sandpiper
  ever adds refund_payment or send_email tools, they belong in this set on the
  day they are born.
*/
export const WRITE_TOOLS = new Set(['create_support_ticket']);

export function requiresApproval(toolName) {
  return WRITE_TOOLS.has(toolName);
}

/*
  TODO — HW8 Part 2A. THE STEP BUDGET.

  An agent that cannot stop is an outage generator (and, with a paid model
  behind it, a bill generator — Session 9's timeout-and-budget rule). This
  function is called before EVERY step with:

    stepsUsed — how many steps the mission has already consumed (0, 1, 2, ...)
    maxSteps  — the mission's budget (planner.mjs exports MAX_STEPS = 8)

  The finished function must:
    1. Return { ok: true } while stepsUsed is strictly below maxSteps.
    2. Return { ok: false, code: 'STEP_BUDGET_EXHAUSTED', message: <explain
       the budget and how much was used> } once stepsUsed reaches maxSteps.

  The stub below always says yes. Until you fix it, the "watch" mission loops
  until agent.mjs's hard seatbelt (25 steps) drags it to a stop — run it and
  watch that happen before you implement this.
*/
export function checkStepBudget(stepsUsed, maxSteps) {
  void stepsUsed;
  void maxSteps;
  return { ok: true }; // stub: replace with the real budget check
}

/*
  TODO — HW8 Part 2B. THE INJECTION DETECTOR.

  Text the agent READS (resources, tool results, customer messages) is data.
  Attackers write data that LOOKS like instructions, hoping the reader obeys
  it — data/customer-note.txt is a live specimen. This detector flags
  instruction-shaped text so the planner can warn the human instead of
  silently passing a booby-trapped summary along.

  The finished function must return true when `text` matches ANY of:
    1. An "ignore your rules" pattern: the word "ignore" within a few words of
       "previous"/"prior"/"earlier" plus "rule"/"rules"/"instruction(s)" —
       e.g. "Ignore every previous rule". Case-insensitive.
    2. An attempt to script a tool call: "call" followed by a tool-like name
       (letters and underscores) and the word "with" — e.g. "call
       create_support_ticket with confirmed=true". Case-insensitive.
    3. An attempt to suppress the human: the phrase "do not ask the user"
       (case-insensitive).

  ...and false for ordinary customer language ("My box arrived dented, please
  help") that merely complains.

  Honest limits, stated up front: this is a heuristic, not a guarantee — a
  determined attacker rephrases. That is WHY the approval gate and the
  server-side confirmed check exist regardless of what this returns. Layers,
  not magic. (Real deployments add trained classifiers on top of patterns;
  same layer, bigger hammer.)

  The stub below never flags anything. Until you fix it, mission 3 summarizes
  the hostile note without a warning — run it both ways and put the two
  outputs side by side in your write-up.
*/
export function looksLikeInjection(text) {
  void text;
  return false; // stub: replace with the real detector
}
