import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ACTION_LINE_PATTERN =
  /^(\s*(?:-\s*)?uses:\s*)([^@\s]+)@([^\s#]+)(\s+#\s+([^\s]+))?(\s*)$/;
const VERSION_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

export function parseActionLine(line) {
  const match = line.match(ACTION_LINE_PATTERN);
  if (!match) return null;

  const [, prefix, action, ref, commentWithSpacing = '', version, suffix] =
    match;
  return {
    prefix,
    action,
    ref,
    commentWithSpacing,
    version,
    suffix,
  };
}

export function parseVersion(value) {
  const match = value?.match(VERSION_PATTERN);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

export function isCompatibleUpdate(current, next) {
  if (compareVersions(next, current) <= 0) return false;
  if (current.major === 0) {
    return next.major === 0 && next.minor === current.minor;
  }
  return next.major === current.major;
}

export function getActionRepository(action) {
  const [owner, repository] = action.split('/');
  if (!owner || !repository) {
    throw new Error(`GitHub Actionの指定が不正です: ${action}`);
  }
  return `${owner}/${repository}`;
}

export async function getWorkflowFiles(workflowsDirectory) {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  return entries
    .filter(
      entry =>
        entry.isFile() &&
        (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))
    )
    .map(entry => path.join(workflowsDirectory, entry.name))
    .sort();
}

async function githubRequest(pathname, token, { allowNotFound = false } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'rectime-api-dependency-updater',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub APIの呼び出しに失敗しました (${response.status}): ${pathname}`
    );
  }
  return response.json();
}

export function isAtLeastDaysOld(value, days, now = Date.now()) {
  if (typeof value !== 'string') return false;
  const publishedAt = Date.parse(value);
  return (
    Number.isFinite(publishedAt) &&
    now - publishedAt >= days * 24 * 60 * 60 * 1000
  );
}

export async function listActionVersions(repository, token) {
  const versions = [];

  for (let page = 1; page <= 10; page += 1) {
    const tags = await githubRequest(
      `/repos/${repository}/tags?per_page=100&page=${page}`,
      token
    );
    for (const tag of tags) {
      const parsed = parseVersion(tag.name);
      if (parsed) versions.push({ name: tag.name, parsed });
    }
    if (tags.length < 100) break;
  }

  return versions;
}

export async function resolveActionTag(repository, tag, token) {
  let object = (
    await githubRequest(
      `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
      token
    )
  ).object;

  for (let depth = 0; object.type === 'tag' && depth < 5; depth += 1) {
    object = (
      await githubRequest(`/repos/${repository}/git/tags/${object.sha}`, token)
    ).object;
  }

  if (object.type !== 'commit' || !/^[0-9a-f]{40}$/.test(object.sha)) {
    throw new Error(`${repository}@${tag}をcommit SHAへ解決できませんでした`);
  }
  return object.sha;
}

export async function getActionVersionDate(repository, tag, token) {
  const release = await githubRequest(
    `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    token,
    { allowNotFound: true }
  );
  return release?.published_at ?? null;
}

export async function readActionReferences(workflowsDirectory) {
  const references = [];
  for (const file of await getWorkflowFiles(workflowsDirectory)) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!line.includes('uses:')) return;
      const actionSpec = line.split('uses:', 2)[1]?.trim();
      if (actionSpec?.startsWith('./') || actionSpec?.startsWith('docker://')) {
        return;
      }
      const parsed = parseActionLine(line);
      if (!parsed) {
        references.push({ file, line: index + 1, invalidLine: line });
        return;
      }
      references.push({ file, line: index + 1, ...parsed });
    });
  }
  return references;
}
