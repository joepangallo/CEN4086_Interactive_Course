/*
  monitor.test.mjs — executable requirements for the synthetic monitor.

  These tests feed evaluateChecks() hand-built fetch results — no network, no
  AWS — and assert that the monitor's judgment is correct. If you edit
  monitor.mjs, these tests are the contract you must not break.

  Run with: npm test        (which runs: node --test monitor.test.mjs)
  Expected result at every point in this assignment: ALL tests pass.
*/

import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChecks, summarize, PAGE_MARKER, EXPECTED_SERVICE } from './monitor.mjs';

// A helper that fabricates the fetch results of a perfectly healthy site.
// Tests then break ONE thing at a time — the same way you will break the real
// site on purpose during the rollback drill.
function healthySite() {
  return {
    pageStatus: 200,
    pageBody: `<html><body><h1>${PAGE_MARKER}</h1></body></html>`,
    statusStatus: 200,
    statusBody: JSON.stringify({
      service: EXPECTED_SERVICE,
      version: '1.0.0',
      banner: 'All systems normal.'
    })
  };
}

test('a healthy site passes every check', () => {
  const checks = evaluateChecks(healthySite());
  const summary = summarize(checks);
  assert.equal(summary.failCount, 0);
  assert.equal(summary.ok, true);
});

test('an unreachable front page fails front-page-reachable', () => {
  const site = healthySite();
  site.pageStatus = 0; // fetchSafe reports a dead host as status 0
  site.pageBody = '';
  const checks = evaluateChecks(site);
  const reachable = checks.find(check => check.name === 'front-page-reachable');
  assert.equal(reachable.pass, false);
  assert.equal(summarize(checks).ok, false);
});

test('a 200 with the WRONG content still fails — content matters, not just status', () => {
  const site = healthySite();
  site.pageBody = '<html><body><h1>Welcome to nginx!</h1></body></html>';
  const checks = evaluateChecks(site);
  const content = checks.find(check => check.name === 'front-page-content');
  assert.equal(content.pass, false);
});

test('a missing status.json fails status-reachable', () => {
  const site = healthySite();
  site.statusStatus = 404;
  site.statusBody = '404 Not Found';
  const checks = evaluateChecks(site);
  const reachable = checks.find(check => check.name === 'status-reachable');
  assert.equal(reachable.pass, false);
});

test('a truncated status.json fails status-valid-json — the broken-deploy signature', () => {
  const site = healthySite();
  // This is exactly what the drill's broken file looks like: cut off mid-string.
  site.statusBody = '{"service":"sandpiper-front-desk","version":"1.1.1","banner":"OOPS the upload was tru';
  const checks = evaluateChecks(site);
  const validJson = checks.find(check => check.name === 'status-valid-json');
  assert.equal(validJson.pass, false);
  assert.equal(summarize(checks).ok, false);
});

test('valid JSON with the wrong service name fails the identity check', () => {
  const site = healthySite();
  site.statusBody = JSON.stringify({ service: 'someone-elses-app', version: '9.9.9' });
  const checks = evaluateChecks(site);
  const identity = checks.find(check => check.name === 'status-service-name');
  assert.equal(identity.pass, false);
});

test('without --expect-version there is no version check at all', () => {
  const checks = evaluateChecks(healthySite());
  assert.equal(checks.find(check => check.name === 'status-version'), undefined);
});

test('with --expect-version the live version must match exactly', () => {
  const matching = evaluateChecks(healthySite(), '1.0.0');
  const versionOk = matching.find(check => check.name === 'status-version');
  assert.equal(versionOk.pass, true);

  const stale = evaluateChecks(healthySite(), '1.1.0');
  const versionStale = stale.find(check => check.name === 'status-version');
  // The old release is still live: reachable, valid, healthy-looking — and wrong.
  assert.equal(versionStale.pass, false);
  assert.equal(summarize(stale).ok, false);
});

test('summarize counts passes and failures accurately', () => {
  const checks = [
    { name: 'a', pass: true, detail: '' },
    { name: 'b', pass: false, detail: '' },
    { name: 'c', pass: false, detail: '' }
  ];
  const summary = summarize(checks);
  assert.equal(summary.passCount, 1);
  assert.equal(summary.failCount, 2);
  assert.equal(summary.ok, false);
});
