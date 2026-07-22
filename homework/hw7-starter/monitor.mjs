/*
  monitor.mjs — the synthetic monitor for the Sandpiper front desk.

  WHO uses this: you, playing the operations engineer. Real teams run probes
  exactly like this from a scheduler every minute of every day.
  WHAT it does: fetches the live site the way a customer's browser would, then
  judges what came back against a checklist of expectations.
  WHERE it points: ANY base URL — first your laptop server, later your S3
  website endpoint. The monitor does not know or care which one it is testing;
  that neutrality is what makes it useful on cutover day.
  WHEN you run it: after every deploy, before you declare the deploy good, and
  during the rollback drill to detect the broken release.
  WHY it exists: "you can't manage what you can't see." A deploy is not done
  when the upload finishes — it is done when the monitor says the site serves
  what customers need.

  Usage:
    node monitor.mjs http://localhost:8080
    node monitor.mjs http://BUCKET.s3-website-us-east-1.amazonaws.com
    node monitor.mjs <base-url> --expect-version=1.1.0

  Exit code 0 = every check passed. Exit code 1 = at least one check failed.
  Exit codes matter because schedulers and CI systems read them, not the text.
*/

// The site marker every healthy front page must contain. If a deploy ships the
// wrong files (or an empty bucket serves a bare error page), this catches it.
export const PAGE_MARKER = 'Sandpiper Surf Supply';

// The service name status.json must declare. A copy-paste of some other app's
// status file would pass a "is it JSON?" check but fail this identity check.
export const EXPECTED_SERVICE = 'sandpiper-front-desk';

/*
  evaluateChecks(...) is a PURE function: raw fetch results in, verdicts out.
  It never touches the network itself. Keeping the judgment separate from the
  fetching is what makes the monitor testable without a live site — the same
  separation you saw between tool logic and transport in earlier homework.

  input shape:
    pageStatus   — HTTP status code from GET <base>/          (number)
    pageBody     — response body text from GET <base>/        (string)
    statusStatus — HTTP status code from GET <base>/status.json (number)
    statusBody   — response body text from GET <base>/status.json (string)
    expectedVersion — optional string from --expect-version=X.Y.Z

  output: an array of { name, pass, detail } — one row per check.
*/
export function evaluateChecks({ pageStatus, pageBody, statusStatus, statusBody }, expectedVersion) {
  const checks = [];

  // Check 1 — the front page is reachable at all.
  checks.push({
    name: 'front-page-reachable',
    pass: pageStatus === 200,
    detail: `GET / returned HTTP ${pageStatus} (expected 200)`
  });

  // Check 2 — the front page is OUR front page. A 200 with the wrong content
  // (a placeholder page, a bucket listing, someone else's site) is still an
  // outage from the customer's point of view.
  checks.push({
    name: 'front-page-content',
    pass: typeof pageBody === 'string' && pageBody.includes(PAGE_MARKER),
    detail: `page body ${typeof pageBody === 'string' && pageBody.includes(PAGE_MARKER) ? 'contains' : 'is missing'} the marker "${PAGE_MARKER}"`
  });

  // Check 3 — the machine-readable status file is reachable.
  checks.push({
    name: 'status-reachable',
    pass: statusStatus === 200,
    detail: `GET /status.json returned HTTP ${statusStatus} (expected 200)`
  });

  // Check 4 — the status file actually parses as JSON. This is the check the
  // rollback drill trips: a truncated upload is bytes, but it is not JSON.
  let parsed = null;
  let parses = false;
  try {
    parsed = JSON.parse(statusBody);
    parses = true;
  } catch {
    parses = false;
  }
  checks.push({
    name: 'status-valid-json',
    pass: parses,
    detail: parses ? 'status.json parsed cleanly' : 'status.json is not valid JSON — a broken or partial deploy'
  });

  // Check 5 — the status file identifies the right service.
  checks.push({
    name: 'status-service-name',
    pass: parses && parsed?.service === EXPECTED_SERVICE,
    detail: parses
      ? `service is "${parsed?.service}" (expected "${EXPECTED_SERVICE}")`
      : 'skipped identity comparison because the JSON did not parse'
  });

  // Check 6 — only when the operator states which release SHOULD be live.
  // On cutover day this is the difference between "something responds" and
  // "the new release is what customers are getting".
  if (expectedVersion !== undefined) {
    checks.push({
      name: 'status-version',
      pass: parses && parsed?.version === expectedVersion,
      detail: parses
        ? `live version is "${parsed?.version}" (expected "${expectedVersion}")`
        : 'skipped version comparison because the JSON did not parse'
    });
  }

  return checks;
}

/*
  summarize(...) reduces the check rows to the one fact a scheduler needs:
  did everything pass? Also pure, also tested.
*/
export function summarize(checks) {
  const failCount = checks.filter(check => !check.pass).length;
  return {
    passCount: checks.length - failCount,
    failCount,
    ok: failCount === 0
  };
}

/*
  The command-line wrapper. This part touches the network, so the tests never
  call it — they import and test the pure functions above instead.

  The comparison answers one question: was THIS file the program the user ran
  (node monitor.mjs ...), or was it merely imported by another file (the tests)?
  Only a direct run should fetch URLs and call process.exit().
*/
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === thisFile;

if (runDirectly) {
  const args = process.argv.slice(2);
  const baseUrl = args.find(arg => !arg.startsWith('--'));
  const versionFlag = args.find(arg => arg.startsWith('--expect-version='));
  const expectedVersion = versionFlag ? versionFlag.split('=')[1] : undefined;

  if (!baseUrl) {
    console.error('Usage: node monitor.mjs <base-url> [--expect-version=X.Y.Z]');
    console.error('Example: node monitor.mjs http://localhost:8080');
    process.exit(1);
  }

  // Trim a trailing slash so both "http://host" and "http://host/" work.
  const base = baseUrl.replace(/\/+$/, '');

  /*
    fetchSafe never throws: a dead host becomes status 0 with an empty body,
    which the checks then fail cleanly. A monitor that crashes on the exact
    outage it exists to detect would be a bad monitor.
  */
  async function fetchSafe(url) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      return { status: 0, body: '', error: error?.message ?? 'network error' };
    }
  }

  const page = await fetchSafe(`${base}/`);
  const status = await fetchSafe(`${base}/status.json`);

  const checks = evaluateChecks(
    {
      pageStatus: page.status,
      pageBody: page.body,
      statusStatus: status.status,
      statusBody: status.body
    },
    expectedVersion
  );
  const summary = summarize(checks);

  console.log(`MONITOR TARGET  ${base}`);
  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name.padEnd(22)} ${check.detail}`);
  }
  console.log(`RESULT  ${summary.passCount} passed, ${summary.failCount} failed → ${summary.ok ? 'SITE HEALTHY' : 'SITE UNHEALTHY'}`);

  process.exit(summary.ok ? 0 : 1);
}
