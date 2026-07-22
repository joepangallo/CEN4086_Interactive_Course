/*
  agent.mjs — the agent loop. IT IS FINISHED; read it top to bottom before
  editing anything else, because every other file exists to serve this loop.

  WHO runs it: you, from a terminal:
      node agent.mjs "What is the status of order ORD-1001?"
      node agent.mjs "Customer reports ORD-1001 arrived damaged and wants a refund ticket"
      node agent.mjs "Summarize the customer note for the morning meeting"
      node agent.mjs "Keep checking ORD-1001 until it says delivered"
      node agent.mjs "<any goal>" --role=read-only

  WHAT it is: the "everything around the model" from the Anatomy of an AI
  Agent page, in about two hundred lines —
      loop      the while(true) below: plan → check → act → observe → repeat
      brain     planner.mjs plan(state)         ← the swappable seam
      tools     the MCP server it spawns        ← support-server.mjs
      guardrails guardrails.mjs                 ← allowlist, budget, detector
      approval  the y/n gate before write tools ← the human in the loop
      memory    the observations array          ← what the mission knows
      trace     trace.jsonl                     ← what the auditor reads

  WHY the agent is a separate PROCESS from the server: the server owns the
  data and its own safety checks; the agent owns the mission. Neither trusts
  the other blindly — the same shape as HW6's adapter and Lambda.
*/

import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { plan, MAX_STEPS } from './planner.mjs';
import { checkToolAllowed, checkStepBudget, requiresApproval } from './guardrails.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
  THE SEATBELT. A hard, dumb ceiling far above the real budget (MAX_STEPS = 8,
  enforced through your Part 2A checkStepBudget). It exists so that the
  UNFINISHED stub cannot loop forever. If a mission ever ends by seatbelt, the
  real budget failed — that is a bug report, not a feature.
*/
const ABSOLUTE_MAX_STEPS = 25;

// ---------- read the command line ----------
const argv = process.argv.slice(2);
const flags = argv.filter(arg => arg.startsWith('--'));
const goal = argv.filter(arg => !arg.startsWith('--')).join(' ').trim();
const role = flags.find(f => f.startsWith('--role='))?.split('=')[1] ?? 'support-agent';

if (!goal) {
  console.error('Usage: node agent.mjs "<mission goal>" [--role=support-agent|read-only]');
  process.exit(1);
}

// ---------- the trace: observability for a two-hundred-line agent ----------
const traceFile = path.join(here, 'trace.jsonl');

/*
  One JSON line per event, appended, never overwritten. After any mission you
  can replay exactly what the agent knew and why it acted — the property that
  separates "an agent we operate" from "a mystery that does things."
*/
async function trace(event) {
  await appendFile(traceFile, JSON.stringify({ at: new Date().toISOString(), goal, role, ...event }) + '\n');
}

// ---------- connect to the tool server over MCP ----------
/*
  The transport SPAWNS support-server.mjs as a child process and speaks MCP
  through its stdin/stdout. This is a real MCP client — the same protocol the
  Inspector used in HW5, now driven by a program instead of your mouse.
*/
const transport = new StdioClientTransport({
  command: process.execPath, // the node binary currently running this file
  args: [path.join(here, 'support-server.mjs')]
});
const client = new Client({ name: 'sandpiper-agent', version: '1.0.0' });
await client.connect(transport);

console.log(`AGENT  role=${role}  budget=${MAX_STEPS} steps`);
console.log(`GOAL   ${goal}`);
console.log('');
await trace({ type: 'mission_start' });

// ---------- the loop ----------
const observations = [];
let stepsUsed = 0;

/*
  Reading tool results defensively: prefer structuredContent (typed data),
  fall back to parsing the display text, and treat unparseable answers as
  failures instead of crashing. An agent's error handling IS its reliability.
*/
function interpretToolResult(raw) {
  if (raw?.structuredContent) return raw.structuredContent;
  try {
    return JSON.parse(raw?.content?.[0]?.text ?? '');
  } catch {
    return { ok: false, code: 'UNREADABLE_RESULT', message: 'The tool answered in a shape the agent could not read.' };
  }
}

while (true) {
  // Seatbelt first: nothing, not even a broken guardrail, gets past this.
  if (stepsUsed >= ABSOLUTE_MAX_STEPS) {
    console.log(`⛔ SEATBELT: ${ABSOLUTE_MAX_STEPS} steps used and the mission is still running.`);
    console.log('   The real step budget (checkStepBudget) should have stopped this long ago — go finish Part 2A.');
    await trace({ type: 'seatbelt_stop', stepsUsed });
    break;
  }

  // The real budget — yours after Part 2A.
  const budget = checkStepBudget(stepsUsed, MAX_STEPS);
  if (!budget.ok) {
    console.log(`🧮 BUDGET STOP after ${stepsUsed} steps: ${budget.message}`);
    console.log('   An agent that stops on its own budget is an agent you can leave unattended.');
    await trace({ type: 'budget_stop', stepsUsed, code: budget.code });
    break;
  }

  // Ask the brain for exactly one next action.
  const action = plan({ goal, role, observations, stepsUsed });
  await trace({ type: 'plan', stepsUsed, action: { ...action, report: action.report?.slice(0, 200) } });

  if (action.type === 'finish') {
    console.log('✅ MISSION REPORT');
    console.log(action.report);
    await trace({ type: 'mission_finish', stepsUsed });
    break;
  }

  if (action.type === 'read_resource') {
    console.log(`📖 step ${stepsUsed + 1}: read ${action.uri}`);
    console.log(`   why: ${action.why}`);
    const result = await client.readResource({ uri: action.uri });
    const text = result?.contents?.[0]?.text ?? '';
    observations.push({ step: stepsUsed, kind: 'resource', name: action.uri, ok: true, result: text });
    await trace({ type: 'observe_resource', stepsUsed, uri: action.uri, bytes: text.length });
    stepsUsed++;
    continue;
  }

  if (action.type === 'call_tool') {
    // GUARDRAIL 1 — least privilege. Checked on EVERY call, before anything else.
    const allowed = checkToolAllowed(role, action.tool);
    if (!allowed.ok) {
      console.log(`🚫 BLOCKED: ${allowed.message}`);
      console.log('   The planner proposed it; the allowlist refused it; the mission ends honestly.');
      await trace({ type: 'blocked_tool', stepsUsed, tool: action.tool, code: allowed.code });
      break;
    }

    let args = action.args;

    // GUARDRAIL 2 — the approval gate. Writes wait for a human, every time.
    if (requiresApproval(action.tool)) {
      console.log('🛑 APPROVAL REQUIRED — the agent wants to change the world:');
      console.log(`   tool: ${action.tool}`);
      console.log(`   args: ${JSON.stringify(args, null, 2).split('\n').join('\n   ')}`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('   Approve this exact call? (y/N) ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y') {
        console.log('🙅 Declined by the human. No write occurred; the mission ends.');
        await trace({ type: 'approval_declined', stepsUsed, tool: action.tool });
        break;
      }
      /*
        THE ONLY PLACE confirmed BECOMES TRUE. Not in the planner, not in a
        document the agent read — here, at the human's keyboard. If you
        remember one line of this starter, make it this one.
      */
      args = { ...args, confirmed: true };
      await trace({ type: 'approval_granted', stepsUsed, tool: action.tool });
    }

    console.log(`🔧 step ${stepsUsed + 1}: call ${action.tool} ${JSON.stringify(args)}`);
    console.log(`   why: ${action.why}`);
    const raw = await client.callTool({ name: action.tool, arguments: args });
    const result = interpretToolResult(raw);
    observations.push({ step: stepsUsed, kind: 'tool', name: action.tool, ok: result?.ok === true, result });
    console.log(`   → ${result?.ok ? 'ok' : `refused (${result?.code ?? 'unknown'})`}`);
    await trace({ type: 'observe_tool', stepsUsed, tool: action.tool, ok: result?.ok === true, code: result?.code });
    stepsUsed++;
    continue;
  }

  // A planner bug (unknown action type) ends the mission instead of spinning.
  console.log(`⚠️ The planner returned an unknown action type: ${JSON.stringify(action)}`);
  await trace({ type: 'unknown_action', stepsUsed });
  break;
}

console.log('');
console.log(`TRACE  ${observations.length} observation(s) · full log appended to trace.jsonl`);
await client.close();
process.exit(0);
