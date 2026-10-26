import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BIN = path.join(ROOT, 'bin', 'mantis.js');

/**
 * Run the real CLI in a child process.
 * @param {string[]} args
 * @param {{cwd?: string, env?: object, timeout?: number}} [opts]
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>}
 */
export function runCli(args, { cwd = ROOT, env = {}, timeout = 240000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`mantis ${args.join(' ')} timed out after ${timeout}ms\n${stderr}`));
    }, timeout);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
