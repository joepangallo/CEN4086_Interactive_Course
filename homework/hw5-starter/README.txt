CEN4086 HW5 STARTER — FROM ANSWERS TO ACTIONS
================================================

READ THE FULL ASSIGNMENT
See hw5.html for the teaching, exact tasks, evidence list, and rubric. This file
is the quick-start reference that travels inside the ZIP.

WHAT MCP IS
MCP means Model Context Protocol. It is a standard conversation between an AI
application's client and a capability server. The server publishes discoverable:

  RESOURCE  = read-only context addressed by a URI
  TOOL      = typed function that reads live state or performs an operation
  PROMPT    = reusable instruction template selected by a user

MCP is not an AI model, RAG index, database, login system, or automatic safety.
The Inspector is a developer test client; it does not run an LLM.

WHAT THIS STARTER PUBLISHES
  Resources (2)
    business://policies
    business://customer-note/security-test

  Tools (3)
    get_order_status
    get_ticket
    create_support_ticket

  Prompts (1)
    resolve_support_case

FILE MAP
  server.mjs           MCP surface: registers resources, tools, and prompt
  support-store.mjs    local data logic; contains your one TODO
  server.test.mjs      executable requirements; DO NOT weaken or delete tests
  data/policies.json   replace with your HW4 business policies
  data/orders.json     three fictional live orders
  data/tickets.json    tool-created tickets; starts empty
  data/customer-note.txt
                       untrusted prompt-injection test fixture

REQUIREMENTS
Node.js 18 or newer and internet access for the first npm install.

RUN THE UNCHANGED STARTER
1. Open a terminal in the folder that contains package.json.
2. Run: npm install
3. Run: npm test
   EXPECTED BASELINE: tests 4, pass 1, fail 3.
   The three failures are intentional because createSupportTicket() returns
   NOT_IMPLEMENTED. They become your Part 2 specification.
4. Run: npm run inspect
5. In the browser, click Connect if needed. Confirm 2 resources, 3 tools,
   and 1 prompt. Stop the Inspector later with Ctrl+C.

YOUR EDITING ORDER
1. Replace data/policies.json and customize business wording in server.mjs.
2. Customize order statuses/dates if desired, but keep IDs ORD-1001, ORD-1002,
   and ORD-1003 because the unchanged tests use all three.
3. Complete createSupportTicket() in support-store.mjs.
4. Run npm test until the result is: tests 4, pass 4, fail 0.
5. Reconnect Inspector and run every Part 3 safety test.
6. Capture evidence and finish the write-up/memo.

STDIO WARNING
The server communicates with the client through stdin/stdout. Never add
console.log() to server.mjs or support-store.mjs: ordinary stdout text corrupts
MCP protocol messages. Use console.error() only for temporary diagnostics, then
remove it before submission.

DATA WARNING
Use fictional policies, orders, tickets, and customer text only. node_modules/
and data/audit.jsonl are intentionally ignored by Git.
