CEN4086 HW6 STARTER — THE TOOL LEAVES YOUR LAPTOP
==================================================

READ THE FULL ASSIGNMENT
See hw6.html for the AWS build order, exact routes, tests, evidence, monitoring,
cost memo, cleanup requirements, and troubleshooting table.

THE ONE-SENTENCE DESIGN
The MCP contract stays on your laptop; its tool implementation moves from local
JSON files to API Gateway + Lambda + DynamoDB on AWS.

WHAT RUNS WHERE
LOCAL LAPTOP
  server-cloud.mjs          MCP server launched by the Inspector
  cloud-support-store.mjs   converts MCP tool calls into HTTPS requests
  .env                      private API URL + demo token; NEVER commit
  data/policies.json        read-only MCP resource

AWS
  lambda_function.py        paste into one Lambda function
  API Gateway HTTP API      three routes that invoke Lambda
  DynamoDB                  ticket persistence
  CloudWatch                sanitized logs, Errors metric, and alarm

GITHUB
  source, tests, safe placeholder .env.example, screenshots, and written work
  NEVER .env, the demo token, AWS credentials, or real customer data

FILE MAP
  lambda_function.py             cloud request/auth/business logic
  server-cloud.mjs               same three public MCP tool contracts as HW5
  cloud-support-store.mjs        local HTTPS adapter
  cloud-support-store.test.mjs   local adapter tests; do not edit
  direct-cloud-test.mjs          bypasses MCP to test Lambda's own boundary
  .env.example                   safe placeholder template; commit this
  data/                           local policy + security-test resources

BEFORE AWS EXISTS
1. Open a terminal in the folder containing package.json.
2. Run: npm install
3. Run: npm test
   EXPECTED: tests 3, pass 3, fail 0.
   These use fake HTTP responses, so the cloud does not need to exist.

AFTER THE AWS API EXISTS
1. Copy .env.example to .env.
2. Put the base invoke URL (no /tickets suffix) and random demo token in .env.
3. Run: git check-ignore .env
   EXPECTED: it prints .env. If not, stop before Git.
4. Run: npm run test:boundary
   EXPECTED: 401 UNAUTHORIZED, then 409 CONFIRMATION_REQUIRED, then PASS.
5. Confirm the DynamoDB table contains zero items, then run: npm run inspect
6. Call get_order_status, create one confirmed ticket once, and read it back.
7. Confirm that same ticket ID is the table's only item. If troubleshooting made
   extras, delete the fictional test items and perform one clean final run.

IMPORTANT
.env is ignored by Git. Confirm it is NOT listed by git status before pushing.
Never paste the token into screenshots, a write-up, source code, a URL, or logs.
Use fictional data only. Capture evidence, then delete every AWS resource named
in the assignment and record the final Learner Lab budget.
