import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  getActionVersionDate,
  getActionRepository,
  isAtLeastDaysOld,
  isCompatibleUpdate,
  parseActionLine,
  parseVersion,
  resolveActionTag,
} from './action-reference-utils.mjs';

const base = process.env.BASE_REF;
const candidate = process.env.CANDIDATE_REF;
const token = process.env.GITHUB_TOKEN;
const frozenDependencies = new Set([
  'npm-check-updates',
  'wrangler',
  '@cloudflare/workers-types',
  '@cloudflare/vitest-pool-workers',
]);

if (!base || !candidate || !token) {
  throw new Error('BASE_REF、CANDIDATE_REF、GITHUB_TOKENが必要です');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
}

function readAt(ref, file) {
  if (ref === 'WORKTREE') return readFile(file, 'utf8');
  return Promise.resolve(
    execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' })
  );
}

function parseDependencyVersion(value) {
  const match = value.match(/^[~^]?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareDependencyVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function assertSameJson(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label}は自動更新の対象外です`);
  }
}

function verifyDependencySection(before = {}, after = {}, label) {
  assertSameJson(Object.keys(before).sort(), Object.keys(after).sort(), label);

  for (const name of Object.keys(before).sort()) {
    if (before[name] === after[name]) continue;
    if (frozenDependencies.has(name)) {
      throw new Error(`${label}.${name}は月次更新の対象外です`);
    }
    const current = parseDependencyVersion(before[name]);
    const next = parseDependencyVersion(after[name]);
    if (!current || !next) {
      throw new Error(`${label}.${name}のversion形式を安全に判定できません`);
    }
    if (compareDependencyVersions(next, current) <= 0) {
      throw new Error(`${label}.${name}が新しいversionになっていません`);
    }
    if (
      next.major !== current.major ||
      (current.major === 0 && next.minor !== current.minor)
    ) {
      throw new Error(`${label}.${name}に破壊的更新が含まれています`);
    }
  }
}

const diffArgs =
  candidate === 'WORKTREE'
    ? ['diff', '--name-only', base, '--']
    : ['diff', '--name-only', base, candidate, '--'];
const changedFiles = git(...diffArgs)
  .split('\n')
  .filter(Boolean);
if (changedFiles.length === 0) throw new Error('更新差分がありません');

for (const file of changedFiles) {
  const allowed =
    file === 'package.json' ||
    file === 'package-lock.json' ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
  if (!allowed) throw new Error(`自動更新の対象外ファイルです: ${file}`);
}

if (changedFiles.includes('package.json')) {
  if (!changedFiles.includes('package-lock.json')) {
    throw new Error('package.json更新時はpackage-lock.jsonも必要です');
  }
  const before = JSON.parse(await readAt(base, 'package.json'));
  const after = JSON.parse(await readAt(candidate, 'package.json'));
  const beforeWithoutDependencies = { ...before };
  const afterWithoutDependencies = { ...after };
  delete beforeWithoutDependencies.dependencies;
  delete beforeWithoutDependencies.devDependencies;
  delete afterWithoutDependencies.dependencies;
  delete afterWithoutDependencies.devDependencies;
  assertSameJson(
    beforeWithoutDependencies,
    afterWithoutDependencies,
    'package.jsonの依存関係以外'
  );
  verifyDependencySection(
    before.dependencies,
    after.dependencies,
    'dependencies'
  );
  verifyDependencySection(
    before.devDependencies,
    after.devDependencies,
    'devDependencies'
  );
}

const resolvedTags = new Map();
const actionVersionDates = new Map();
for (const file of changedFiles.filter(name =>
  name.startsWith('.github/workflows/')
)) {
  const beforeLines = (await readAt(base, file)).split('\n');
  const afterLines = (await readAt(candidate, file)).split('\n');
  if (beforeLines.length !== afterLines.length) {
    throw new Error(`${file}ではAction参照行以外を変更できません`);
  }

  for (let index = 0; index < beforeLines.length; index += 1) {
    if (beforeLines[index] === afterLines[index]) continue;
    const previous = parseActionLine(beforeLines[index]);
    const next = parseActionLine(afterLines[index]);
    if (
      !previous ||
      !next ||
      previous.prefix !== next.prefix ||
      previous.action !== next.action ||
      previous.suffix !== next.suffix
    ) {
      throw new Error(
        `${file}:${index + 1} Action参照以外の変更が含まれています`
      );
    }
    if (!/^[0-9a-f]{40}$/.test(next.ref)) {
      throw new Error(`${file}:${index + 1} full commit SHAではありません`);
    }
    const previousVersion = parseVersion(previous.version);
    const nextVersion = parseVersion(next.version);
    if (
      !previousVersion ||
      !nextVersion ||
      !isCompatibleUpdate(previousVersion, nextVersion)
    ) {
      throw new Error(`${file}:${index + 1} 互換更新ではありません`);
    }

    const repository = getActionRepository(next.action);
    if (repository === 'actions/add-to-project') {
      throw new Error(
        `${file}:${index + 1} 自動検証できないActionは月次更新の対象外です`
      );
    }
    const key = `${repository}@${next.version}`;
    if (!resolvedTags.has(key)) {
      resolvedTags.set(key, resolveActionTag(repository, next.version, token));
    }
    const expectedSha = await resolvedTags.get(key);
    if (next.ref !== expectedSha) {
      throw new Error(`${file}:${index + 1} tagとcommit SHAが一致しません`);
    }
    if (!actionVersionDates.has(key)) {
      actionVersionDates.set(
        key,
        getActionVersionDate(repository, next.version, token)
      );
    }
    const publishedAt = await actionVersionDates.get(key);
    if (!isAtLeastDaysOld(publishedAt, 7)) {
      throw new Error(`${file}:${index + 1} 公開から7日経過していません`);
    }
  }
}

console.log(`更新差分を確認しました: ${changedFiles.join(', ')}`);
