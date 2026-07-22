CEN4086 HW7 STARTER — CUTOVER WEEKEND
================================================

READ THE FULL ASSIGNMENT
See hw7.html for the teaching, exact tasks, and evidence list. This file is the
quick-start reference that travels inside the ZIP.

THE STORY
Sandpiper Surf Supply's public "front desk" page still runs on an aging office
computer (played by serve.mjs on your laptop). You will disposition the
company's app portfolio with the 6 Rs, REHOST this site to Amazon S3 static
website hosting, rehearse a cutover with a deliberate bad deploy and a
versioning rollback, put operations guardrails on the bucket (tags + lifecycle),
estimate the monthly bill, and then clean up completely.

FILE MAP
  serve.mjs             the "legacy server": serves ./site at localhost:8080
  monitor.mjs           synthetic monitor: judges ANY deployment of the site
  monitor.test.mjs      executable requirements for the monitor; keep passing
  site/index.html       the front desk page (fetches status.json for a banner)
  site/style.css        the page's stylesheet
  site/status.json      machine-readable release + banner file, version 1.0.0
  drills/broken-status.json
                        a deliberately truncated status file for the rollback
                        drill; upload it AS status.json to fake a bad deploy

REQUIREMENTS
Node.js 18 or newer. No npm install is needed — the starter has zero
dependencies on purpose (static sites should be boring).

RUN THE UNCHANGED STARTER
1. Open a terminal in the folder that contains package.json.
2. Run: npm test
   EXPECTED: every test passes. This starter ships complete; your work is the
   migration and operations of the site, not new code.
3. Run: npm start
   Open http://localhost:8080 — the banner should read "All systems normal".
4. In a SECOND terminal, run: node monitor.mjs http://localhost:8080
   EXPECTED: 5 PASS lines and "SITE HEALTHY".
5. Stop the server with Ctrl+C and run the monitor again.
   EXPECTED: failures. Feel what "down" looks like before AWS makes it rare.

WHERE THE MONITOR POINTS LATER
The same command verifies the migrated site:
   node monitor.mjs http://YOUR-BUCKET.s3-website-us-east-1.amazonaws.com
and on cutover day, with a release expectation:
   node monitor.mjs <endpoint> --expect-version=1.1.0

DATA WARNING
Use fictional business data only. Never put real names, emails, or credentials
in the site files — the migrated bucket is PUBLIC by design.
