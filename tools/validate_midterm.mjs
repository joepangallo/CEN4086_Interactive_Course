#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const file = path.resolve(process.argv[2] || 'midterm.html');
const answerKeyFile = process.argv[3] ? path.resolve(process.argv[3]) : null;
const html = fs.readFileSync(file, 'utf8');
const failures = [];

const EXPECTED = {
  scenarioQuestions: 8,
  freeResponseParts: 25,
  multipleChoiceQuestions: 18,
  regularMultipleChoiceQuestions: 15,
  bonusMultipleChoiceQuestions: 3,
  firstMcNumber: 9,
  lastMcNumber: 26,
  optionsPerMc: 5,
  maxQuestionWords: 4600,
};

function count(pattern, text = html) {
  return [...text.matchAll(pattern)].length;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function cleanText(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|nbsp);/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanOptionText(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

const scenarioCount = count(/<section class="qcard">/g);
const scenarioBlocks = [...html.matchAll(/<section class="qcard">([\s\S]*?)<\/section>/g)]
  .map((match) => match[1]);
const partCount = count(/<div class="part">/g);
const textareaCount = count(/<textarea class="work"/g);
const quizSection = html.match(/<section class="quiz" id="mcquiz">([\s\S]*?)<\/section>/);
const mcHtml = quizSection?.[1] || '';
const mcMatches = [...mcHtml.matchAll(/<div class="q( bonus)?">([\s\S]*?)<\/div>/g)];
const mcBlocks = mcMatches.map((match) => match[2]);
const mcBonusFlags = mcMatches.map((match) => Boolean(match[1]));
const mcNumbers = mcBlocks.map((block) => Number(block.match(/<h4>Q(\d+)/)?.[1]));
const scenarioNumbers = [...html.matchAll(/<span class="qnum">(\d+)<\/span>/g)].map((match) => Number(match[1]));
const expectedScenarioNumbers = Array.from({ length: EXPECTED.scenarioQuestions }, (_, i) => i + 1);
const expectedMcNumbers = Array.from(
  { length: EXPECTED.multipleChoiceQuestions },
  (_, i) => EXPECTED.firstMcNumber + i,
);

assert(scenarioCount === EXPECTED.scenarioQuestions,
  'expected ' + EXPECTED.scenarioQuestions + ' scenario questions, found ' + scenarioCount);
scenarioBlocks.forEach((block, index) => {
  if (index !== 2) {
    assert(!/calculator/i.test(block),
      'Q' + (index + 1) + ' refers to the calculator even though only Q3 should require it');
  }
});
assert(partCount === EXPECTED.freeResponseParts,
  'expected ' + EXPECTED.freeResponseParts + ' free-response parts, found ' + partCount);
assert(textareaCount === partCount,
  'expected one textarea per free-response part, found ' + textareaCount + ' textareas for ' + partCount + ' parts');
assert(mcBlocks.length === EXPECTED.multipleChoiceQuestions,
  'expected ' + EXPECTED.multipleChoiceQuestions + ' MC questions, found ' + mcBlocks.length);
assert(mcBonusFlags.slice(0, EXPECTED.regularMultipleChoiceQuestions).every((flag) => !flag),
  'Q9-Q23 must be regular multiple-choice questions');
assert(mcBonusFlags.slice(EXPECTED.regularMultipleChoiceQuestions).length === EXPECTED.bonusMultipleChoiceQuestions &&
  mcBonusFlags.slice(EXPECTED.regularMultipleChoiceQuestions).every(Boolean),
  'the final three questions, Q24-Q26, must be marked bonus');
assert(JSON.stringify(scenarioNumbers) === JSON.stringify(expectedScenarioNumbers),
  'scenario numbering is not sequential: ' + scenarioNumbers.join(', '));
assert(JSON.stringify(mcNumbers) === JSON.stringify(expectedMcNumbers),
  'MC numbering is not Q' + EXPECTED.firstMcNumber + '-Q' + EXPECTED.lastMcNumber + ': ' + mcNumbers.join(', '));

mcBlocks.forEach((block, index) => {
  const options = [...block.matchAll(/<button class="opt">([\s\S]*?)<\/button>/g)].map((match) => cleanOptionText(match[1]));
  assert(options.length === EXPECTED.optionsPerMc,
    'Q' + mcNumbers[index] + ' has ' + options.length + ' options; expected ' + EXPECTED.optionsPerMc);
  assert(new Set(options).size === options.length,
    'Q' + mcNumbers[index] + ' contains duplicate option text');
});

const questionRegion = html.match(/<section class="card">[\s\S]*?<section class="card submit"/)?.[0] || '';
const questionWords = cleanText(questionRegion).split(/\s+/).filter(Boolean).length;
assert(questionWords <= EXPECTED.maxQuestionWords,
  'question text is ' + questionWords + ' words; limit is ' + EXPECTED.maxQuestionWords);

assert(/positions 25-42/.test(html), 'instructor contract must declare answer-key positions 25-42');
assert(/currently 25/.test(html), 'instructor contract must declare 25 free-response parts');
assert(/Part I 40 points/.test(html) && /Part II 45 points/.test(html) && /Part III 15 base points/.test(html),
  'base point totals must be 40 + 45 + 15');
assert(/Questions 9–23 are worth one point each/.test(html) && /Questions 24–26 are optional one-point bonus questions/.test(html),
  'student-facing Part III instructions must distinguish 15 regular and 3 bonus questions');
assert(!/76 free-response|positions 53-67|currently 53/.test(html),
  'stale pre-revision positional contract remains in the page');
assert(!/positions 25-39/.test(html), 'stale 15-question positional contract remains in the page');
assert(!/Multi-AZ|fall in seconds to the offline rig|hurricane threatens the region/i.test(html),
  'a retired technically ambiguous prompt remains in the page');
const studentFacingHtml = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
assert(!/\bWeek\s*\d|\bSession\s*\d/i.test(cleanText(studentFacingHtml)),
  'student-facing text contains a week or numbered-session reference');
assert(!/\b(?:iss|sub|aud|amr|iat|exp)\s*:/i.test(cleanText(studentFacingHtml)),
  'student-facing text contains abbreviated token-claim syntax');
assert(/const PKEY='cen4086v5:/.test(html) && /const MCKEY='cen4086v5:/.test(html),
  'draft and MC storage keys must use the revised v5 namespace');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
inlineScripts.forEach((match, index) => {
  try {
    new Function(match[1]);
  } catch (error) {
    failures.push('inline script ' + (index + 1) + ' has a syntax error: ' + error.message);
  }
});

if (answerKeyFile) {
  const keySource = fs.readFileSync(answerKeyFile, 'utf8');
  const encodedSource = Buffer.from(keySource).toString('base64');
  const { ANSWER_KEYS } = await import('data:text/javascript;base64,' + encodedSource);
  const key = ANSWER_KEYS?.['week1-midterm'];

  assert(Array.isArray(key), 'private answer key does not contain week1-midterm');
  if (Array.isArray(key)) {
    assert(key.length === partCount + mcBlocks.length,
      'private answer key has ' + key.length + ' entries; expected ' + (partCount + mcBlocks.length));
    assert(key.slice(0, partCount).every((entry) => entry === null),
      'private answer-key positions for written responses must all be null');

    const mcKey = key.slice(partCount);
    assert(mcKey.slice(0, EXPECTED.regularMultipleChoiceQuestions).every((entry) => entry && entry.bonus !== true),
      'Q9-Q23 answer-key entries must be regular points');
    assert(mcKey.slice(EXPECTED.regularMultipleChoiceQuestions).every((entry) => entry && entry.bonus === true),
      'Q24-Q26 answer-key entries must be marked bonus');
    mcBlocks.forEach((block, index) => {
      const options = [...block.matchAll(/<button class="opt">([\s\S]*?)<\/button>/g)]
        .map((match) => cleanOptionText(match[1]));
      const entry = mcKey[index];
      assert(entry && Number.isInteger(entry.correctIndex),
        'private answer key is missing a valid correctIndex for Q' + mcNumbers[index]);
      if (entry && Number.isInteger(entry.correctIndex)) {
        assert(options[entry.correctIndex] === entry.correctText,
          'private answer-key text/index does not match the visible option for Q' + mcNumbers[index]);
      }
    });
  }
}

if (failures.length) {
  console.error('Midterm validation failed for ' + file + ':');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exitCode = 1;
} else {
  console.log('Midterm validation passed: ' + scenarioCount + ' scenarios, ' + partCount +
    ' written responses, ' + mcBlocks.length + ' MC questions, ' + questionWords + ' question words' +
    (answerKeyFile ? ', private key matched.' : '.'));
}
