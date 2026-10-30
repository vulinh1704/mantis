/**
 * Post the Mantis result on the pull request, or update the comment an earlier run posted (one per
 * command, found by a hidden marker), with a link to the uploaded reports and sheets. The pull
 * request comes from the event, or, for a deployment (Vercel and Netlify report preview URLs as
 * deployment statuses), from the deployed commit. Without one it does nothing; without write
 * access (a pull request from a fork) it warns.
 */
import { readFile } from 'node:fs/promises';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

export const marker = (command) => `<!-- mantis-action:${command} -->`;

export function commentBody(markdown, { command, artifactUrl }) {
  const link = artifactUrl ? `📎 [Reports, sheets and screenshots](${artifactUrl}) · ` : '';
  return `${marker(command)}\n${markdown.trim()}\n\n${link}<sub>by <a href="https://github.com/vulinh1704/mantis">Mantis</a>, updated on every run</sub>\n`;
}

async function gh(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mantis-action' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The pull request to comment on: the event's, or the open one that contains the deployed commit. */
export async function pullRequestOf(event, { repo, token, sha, api = gh }) {
  const direct = event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : null);
  if (direct) return direct;
  const commit = event.deployment?.sha ?? sha;
  if (!commit) return null;
  const pulls = await api('GET', `${API}/repos/${repo}/commits/${commit}/pulls`, token);
  return pulls.find((p) => p.state === 'open')?.number ?? null;
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const pr = await pullRequestOf(event, { repo, token, sha: process.env.GITHUB_SHA });
  if (!pr) {
    console.log('No pull request for this run: no comment.');
    return;
  }
  const command = process.env.COMMAND || 'look';
  const body = commentBody(await readFile(process.env.COMMENT_FILE, 'utf8'), { command, artifactUrl: process.env.ARTIFACT_URL });
  const comments = await gh('GET', `${API}/repos/${repo}/issues/${pr}/comments?per_page=100`, token);
  const mine = comments.find((c) => c.body?.startsWith(marker(command)));
  if (mine) {
    await gh('PATCH', `${API}/repos/${repo}/issues/comments/${mine.id}`, token, { body });
    console.log(`Updated ${mine.html_url}`);
  } else {
    const c = await gh('POST', `${API}/repos/${repo}/issues/${pr}/comments`, token, { body });
    console.log(`Commented ${c.html_url}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith('comment.mjs')) {
  main().catch((err) => {
    // A pull request from a fork gets a read-only token: report, don't fail the check for it.
    console.log(`::warning title=Mantis::could not comment on the pull request (${err.message}). The result is in the job summary.`);
  });
}
