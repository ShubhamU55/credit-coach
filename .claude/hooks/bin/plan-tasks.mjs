#!/usr/bin/env node
// Prints a plan's tasks as JSON for the /build command and the feature-build workflow.
// Usage: node .claude/hooks/bin/plan-tasks.mjs <planPath> [ids...]   (no ids = every task)
import fs from 'node:fs';
import { parsePlanTasks } from '../lib/plan-tasks.mjs';

const USAGE = 'usage: plan-tasks.mjs <planPath> [ids...]';

function selectTasks(planPath, ids) {
  const tasks = parsePlanTasks(fs.readFileSync(planPath, 'utf8'));
  if (tasks.length === 0) {
    throw new Error(`no "### Task <id>: <title>" headings found in ${planPath}`);
  }
  if (ids.length === 0) return tasks;

  const unknown = ids.filter((id) => !tasks.some((task) => task.id === id));
  if (unknown.length > 0) {
    throw new Error(`unknown task id(s) in ${planPath}: ${unknown.join(', ')}`);
  }
  return tasks.filter((task) => ids.includes(task.id));
}

const [planPath, ...ids] = process.argv.slice(2);

if (!planPath) {
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${JSON.stringify(selectTasks(planPath, ids), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `plan-tasks: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`,
    );
    process.exitCode = 1;
  }
}
