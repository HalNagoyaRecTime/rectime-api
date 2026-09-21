import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  getActionVersionDate,
  getActionRepository,
  getWorkflowFiles,
  isAtLeastDaysOld,
  isCompatibleUpdate,
  listActionVersions,
  parseActionLine,
  parseVersion,
  readActionReferences,
  resolveActionTag,
} from './action-reference-utils.mjs';

const mode = process.argv[2];
const workflowsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../workflows'
);

if (mode === '--check') {
  const problems = [];
  for (const reference of await readActionReferences(workflowsDirectory)) {
    const relativeFile = path.relative(process.cwd(), reference.file);
    if (reference.invalidLine) {
      problems.push(
        `${relativeFile}:${reference.line} Actionの指定を解析できません`
      );
      continue;
    }
    if (!/^[0-9a-f]{40}$/.test(reference.ref)) {
      problems.push(
        `${relativeFile}:${reference.line} full commit SHAで固定されていません`
      );
    }
    if (!parseVersion(reference.version)) {
      problems.push(
        `${relativeFile}:${reference.line} 正確なversionコメントがありません`
      );
    }
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('GitHub Actionsはすべてfull commit SHAで固定されています。');
  process.exit(0);
}

if (mode !== '--update-compatible') {
  throw new Error(
    '使用方法: node .github/scripts/update-actions.mjs --check|--update-compatible'
  );
}

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKENが設定されていません');

const cooldownDays = 7;
const frozenActions = new Set(['actions/add-to-project']);
const repositoryCache = new Map();
const resolvedTagCache = new Map();
const versionDateCache = new Map();

async function findUpdate(action, currentTag) {
  const repository = getActionRepository(action);
  if (frozenActions.has(repository)) return null;
  const current = parseVersion(currentTag);
  if (!current) throw new Error(`${action}のversionコメントが不正です`);

  if (!repositoryCache.has(repository)) {
    repositoryCache.set(repository, listActionVersions(repository, token));
  }
  const versions = await repositoryCache.get(repository);
  const compatible = versions
    .filter(({ parsed }) => isCompatibleUpdate(current, parsed))
    .sort((left, right) => compareVersions(right.parsed, left.parsed));

  let latest = null;
  for (const candidate of compatible) {
    const candidateKey = `${repository}@${candidate.name}`;
    if (!versionDateCache.has(candidateKey)) {
      versionDateCache.set(
        candidateKey,
        getActionVersionDate(repository, candidate.name, token)
      );
    }
    if (
      isAtLeastDaysOld(await versionDateCache.get(candidateKey), cooldownDays)
    ) {
      latest = candidate;
      break;
    }
  }
  if (!latest) return null;
  const cacheKey = `${repository}@${latest.name}`;
  if (!resolvedTagCache.has(cacheKey)) {
    resolvedTagCache.set(
      cacheKey,
      resolveActionTag(repository, latest.name, token)
    );
  }
  return { tag: latest.name, sha: await resolvedTagCache.get(cacheKey) };
}

let updateCount = 0;
for (const file of await getWorkflowFiles(workflowsDirectory)) {
  const original = await readFile(file, 'utf8');
  const lines = original.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('uses:')) continue;
    const actionSpec = lines[index].split('uses:', 2)[1]?.trim();
    if (actionSpec?.startsWith('./') || actionSpec?.startsWith('docker://')) {
      continue;
    }
    const reference = parseActionLine(lines[index]);
    if (!reference) {
      throw new Error(`${file}:${index + 1} Actionの指定を解析できません`);
    }
    if (
      !/^[0-9a-f]{40}$/.test(reference.ref) ||
      !parseVersion(reference.version)
    ) {
      throw new Error(
        `${file}:${index + 1} full SHAと正確なversionコメントが必要です`
      );
    }

    const update = await findUpdate(reference.action, reference.version);
    if (!update) continue;

    lines[index] =
      `${reference.prefix}${reference.action}@${update.sha} # ${update.tag}${reference.suffix}`;
    console.log(`${reference.action}: ${reference.version} → ${update.tag}`);
    updateCount += 1;
  }

  const updated = lines.join('\n');
  if (updated !== original) await writeFile(file, updated);
}

console.log(
  updateCount === 0
    ? 'GitHub Actionsの互換更新はありません。'
    : `${updateCount}箇所のGitHub Actionsを更新しました。`
);
