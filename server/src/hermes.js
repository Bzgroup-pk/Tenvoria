import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/** Calls the installed Hermes CLI with a fixed argv (no shell interpolation).
 * The prompt explicitly prohibits the agent from publishing, spending money,
 * changing credentials, or deploying. Those actions must be separate approved tools.
 */
export async function runHermes({ title, description, department, scope }) {
  if (!config.HERMES_ENABLED) throw new Error('Hermes execution is disabled. Configure and verify Hermes before enabling it.');
  const cwd = path.resolve(config.HERMES_WORKSPACE);
  await mkdir(cwd, { recursive: true });
  const prompt = [
    'You are a task execution agent inside TENVORIA.',
    `Application scope: ${scope}. Department: ${department}. Task: ${title}.`,
    'Produce a useful result, explain assumptions, and include a verification checklist.',
    'Safety constraints: do not publish content, send messages, spend money, change account settings, access secrets, or deploy anything.',
    'Do not claim to have executed tools or tests unless you actually did so.',
    `Task details:\n${description}`
  ].join('\n\n');
  return await new Promise((resolve, reject) => {
    const child = spawn(config.HERMES_BIN, ['chat', '-q', prompt], { cwd, shell: false, windowsHide: true, env: { ...process.env } });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill('SIGTERM'); reject(new Error('Hermes execution timed out.')); } }, config.HERMES_TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; if (stdout.length > 200_000) child.kill('SIGTERM'); });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; if (stderr.length > 20_000) stderr = stderr.slice(-20_000); });
    child.on('error', err => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`Could not start Hermes: ${err.message}`)); } });
    child.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Hermes exited with code ${code}: ${stderr.slice(-2000)}`));
      if (!stdout.trim()) return reject(new Error(`Hermes returned no output. ${stderr.slice(-1000)}`));
      resolve(stdout.trim());
    });
  });
}
