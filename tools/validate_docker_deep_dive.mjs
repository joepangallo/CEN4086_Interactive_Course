import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const pagePath = path.join(root, 'docker-deep-dive.html');
const html = fs.readFileSync(pagePath, 'utf8');
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

check(/^<!DOCTYPE html>/i.test(html), 'Missing HTML5 doctype.');
check(/<title>Docker Field Guide — Learn by Doing<\/title>/.test(html), 'Unexpected or missing page title.');

const expectedLabs = ['picture', 'terminal', 'build', 'fromscratch', 'portsdata', 'operate', 'challenge'];
const actualLabs = [...html.matchAll(/<section class="lab" id="([^"]+)"/g)].map(match => match[1]);
check(JSON.stringify(actualLabs) === JSON.stringify(expectedLabs), `Expected seven ordered labs (${expectedLabs.join(', ')}), found ${actualLabs.join(', ')}.`);
for (const id of expectedLabs) {
  check(html.includes(`href="#${id}" data-section="${id}"`), `Progress rail is missing ${id}.`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
check(duplicateIds.length === 0, `Duplicate HTML ids: ${duplicateIds.join(', ')}`);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
check(Boolean(scriptMatch), 'Inline lesson script is missing.');
if (scriptMatch) {
  try {
    new Function(scriptMatch[1]);
  } catch (error) {
    failures.push(`Inline JavaScript does not parse: ${error.message}`);
  }
  checks += 1;

  const literalIdReferences = [...scriptMatch[1].matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
  const missingIds = [...new Set(literalIdReferences.filter(id => !ids.includes(id)))];
  check(missingIds.length === 0, `JavaScript references missing ids: ${missingIds.join(', ')}`);
}

const staticButtons = [...html.matchAll(/<button\b([^>]*)>/g)];
const buttonsMissingType = staticButtons.filter(match => !/\btype="button"/.test(match[1]));
check(buttonsMissingType.length === 0, `${buttonsMissingType.length} static button(s) are missing type="button".`);

const checkpoints = [...html.matchAll(/class="checkpoint" data-checkpoint="([^"]+)" data-correct="(\d+)"/g)];
check(checkpoints.length === 5, `Expected five inline checkpoints plus terminal and final challenge completion, found ${checkpoints.length}.`);
check(JSON.stringify(checkpoints.map(match => match[1])) === JSON.stringify(['picture', 'build', 'fromscratch', 'portsdata', 'operate']), 'Checkpoint lab ids are incomplete or out of order.');

const questionStart = html.indexOf('const questions=[');
const questionEnd = html.indexOf('\n];\nlet qIndex', questionStart);
check(questionStart >= 0 && questionEnd > questionStart, 'Could not locate the challenge question bank.');
if (questionStart >= 0 && questionEnd > questionStart) {
  try {
    const expression = html.slice(questionStart + 'const questions='.length, questionEnd + 2);
    const questions = new Function(`return ${expression}`)();
    check(questions.length === 17, `Expected 17 challenge questions, found ${questions.length}.`);
    check(questions.every(item => item.answers.length === 4 && item.correct >= 0 && item.correct < 4 && item.why.length >= 80), 'Every challenge item must have four options, a valid answer, and detailed feedback.');
  } catch (error) {
    failures.push(`Challenge question bank does not evaluate: ${error.message}`);
    checks += 2;
  }
}

const requiredInteractiveIds = [
  'learningBarFill', 'spawnBtn', 'termInput', 'fillMissionHint', 'dlinePanel', 'layerStack',
  'stagePanel', 'portTest', 'volVerdict', 'runtimeStatePanel', 'incidentOptions',
  'routeExplain', 'answerList'
];
check(requiredInteractiveIds.every(id => ids.includes(id)), 'One or more required interactive surfaces are missing.');
const missionRunnerStart = html.indexOf("$('#fillMissionHint').addEventListener('click'");
const missionRunnerEnd = html.indexOf("$('#termReset').addEventListener('click'", missionRunnerStart);
const missionRunner = missionRunnerStart >= 0 && missionRunnerEnd > missionRunnerStart
  ? html.slice(missionRunnerStart, missionRunnerEnd)
  : '';
check(missionRunner.includes('execLine(command)'), 'The mission helper must execute the next command, not only fill the prompt.');
check((html.match(/\.addEventListener\(/g) || []).length >= 25, 'The page has fewer interaction handlers than expected.');
check((html.match(/<pre class="yaml"/g) || []).length >= 18, 'Expected at least 18 copyable code examples.');
check((html.match(/href="https:\/\/docs\.docker\.com\//g) || []).length >= 8, 'Expected at least eight maintained Docker documentation links.');

check(html.includes('node:24-alpine'), 'Current Node 24 LTS example is missing.');
check(!html.includes('node:20-alpine'), 'End-of-life Node 20 example remains.');
check(html.includes('python:3.14-alpine'), 'Current Python 3.14 example is missing.');
check(html.includes('condition:</span> service_healthy'), 'Compose readiness condition is missing.');
check(html.includes('POSTGRES_PASSWORD_FILE'), 'Compose runtime-secret example is missing.');
check(html.includes('id="share-image"'), 'Image-sharing handoff section is missing.');
check(html.indexOf('id="share-image"') > html.indexOf('id="build"') && html.indexOf('id="share-image"') < html.indexOf('id="fromscratch"'), 'Image-sharing handoff must appear inside Lab 3, immediately after students build the image.');
check(html.includes('docker push YOUR_DOCKER_ID/myapp:1.0'), 'Registry push example is missing.');
check(html.includes('docker pull YOUR_DOCKER_ID/myapp:1.0'), 'Recipient pull example is missing.');
check(html.includes('docker save -o myapp-1.0.tar'), 'Offline image save example is missing.');
check(html.includes('docker load -i myapp-1.0.tar'), 'Offline image load example is missing.');
check(html.includes('id="data-lifecycle"'), 'Container data-lifecycle section is missing.');
check(html.indexOf('id="data-lifecycle"') > html.indexOf('id="portsdata"') && html.indexOf('id="data-lifecycle"') < html.indexOf('id="operate"'), 'Container data-lifecycle section must appear inside Lab 5.');
check(html.includes('writable container layer'), 'Read-only image versus writable container-layer explanation is missing.');
check(html.includes('docker compose down --volumes'), 'Compose volume-deletion example is missing.');
check(html.includes('docker run --read-only'), 'Read-only root filesystem example is missing.');
check(html.includes('docker volume prune --all'), 'Named-volume prune warning is missing.');

const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
const brokenInternalLinks = [];
for (const href of hrefs) {
  if (/^(?:https?:|mailto:|#)/.test(href)) continue;
  const relative = href.split('#')[0];
  if (!relative) continue;
  if (!fs.existsSync(path.resolve(root, relative))) brokenInternalLinks.push(href);
}
check(brokenInternalLinks.length === 0, `Broken internal links: ${brokenInternalLinks.join(', ')}`);

const unsafeBlankTargets = [...html.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/g)]
  .filter(match => !/rel="[^"]*noopener[^"]*"/.test(match[1]));
check(unsafeBlankTargets.length === 0, `${unsafeBlankTargets.length} external link(s) with target="_blank" are missing rel="noopener".`);

if (failures.length) {
  console.error(`Docker deep dive validation failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log(`Docker deep dive validation passed: ${checks} checks across 7 labs, 17 challenge questions, ${staticButtons.length} static buttons, and ${ids.length} unique ids.`);
