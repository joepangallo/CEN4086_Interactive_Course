CEN4086 HW8 STARTER — THE AGENT TAKES A SHIFT
================================================

READ THE FULL ASSIGNMENT
See hw8.html for the teaching, exact tasks, and evidence list. This file is the
quick-start reference that travels inside the ZIP.

THE STORY
HW5 built MCP tools. HW6 gave them a cloud backend. Both times, a human clicked
every call in the Inspector. Tonight the human steps back: you build the AGENT —
the loop that plans, calls the tools, observes results, and decides what to do
next — plus the guardrails that make leaving it alone survivable.

There is NO model API key anywhere in this assignment. The "brain" is a
deterministic planner (plan() in planner.mjs) — a scripted stand-in with the
exact same contract an LLM-backed planner has: state in, one action out.
Everything else (the loop, guardrails, approval gate, budget, trace) is the
same machinery real agent products run. Swapping the brain later is one
function; that seam is the final write-up question.

FILE MAP
  agent.mjs            the agent loop — FINISHED; read it first, edit it never
  planner.mjs          the brain — one TODO: decideRefundStep() (Part 3)
  guardrails.mjs       the safety layer — two TODOs: checkStepBudget() and
                       looksLikeInjection() (Part 2)
  support-server.mjs   the MCP tool server — FINISHED (same surface as HW5)
  memory-store.mjs     in-memory data + the server-side write boundary — FINISHED
  agent.test.mjs       executable requirements; DO NOT weaken or delete tests
  data/policies.json   fictional business policies
  data/orders.json     three fictional orders (ORD-1001..1003)
  data/customer-note.txt
                       untrusted prompt-injection test fixture
  trace.jsonl          created at runtime; one JSON line per agent event

REQUIREMENTS
Node.js 18 or newer and internet access for the first npm install.

RUN THE UNCHANGED STARTER
1. Open a terminal in the folder that contains package.json.
2. Run: npm install
3. Run: npm test
   EXPECTED BASELINE: tests 16, pass 10, fail 6.
   The six failures are intentional: two guardrail stubs (Part 2) and the
   refund branch (Part 3). They are your specification.
4. Run mission 1 — it works out of the box:
   node agent.mjs "What is the status of order ORD-1001?"
5. Open trace.jsonl and find the mission you just ran.

THE MISSIONS (details and order in hw8.html)
  node agent.mjs "What is the status of order ORD-1001?"
  node agent.mjs "Customer reports ORD-1001 arrived damaged and wants a refund ticket"
  node agent.mjs "Summarize the customer note for the morning meeting"
  node agent.mjs "Keep checking ORD-1001 until it says delivered"
  ...and any mission with --role=read-only

STDIO WARNING
support-server.mjs talks MCP over stdin/stdout — never add console.log() THERE.
agent.mjs is a separate process and prints freely; that split is on purpose.

DATA WARNING
Use fictional orders, tickets, and customer text only. trace.jsonl and
node_modules/ are intentionally ignored by Git.
