import { execFileSync } from 'node:child_process';
import path from 'node:path';

// PRで追加・変更したmigrationが、適用済みの環境と矛盾しないかを検査する。
// wranglerはd1_migrationsへファイル名で適用済みを記録するため、マージ済みファイルの
// 変更・改名・削除や、番号の重複・逆行は、環境ごとの不整合や適用失敗につながる。
//
// HEADのコミット済みの内容を、BASE_REF(PR先ブランチ)と比較する。
// 例: BASE_REF=origin/develop npm run migrations:check

const base = process.env.BASE_REF;
const migrationsDirectory = 'migrations';
const fileNamePattern = /^(\d{4})_[a-z0-9_]+\.sql$/;

if (!base) {
  throw new Error('BASE_REFが必要です(例: BASE_REF=origin/develop)');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
}

function splitLines(output) {
  return output === '' ? [] : output.split('\n');
}

function getMigrationNumber(file) {
  const match = path.posix.basename(file).match(fileNamePattern);
  return match ? Number(match[1]) : null;
}

function formatNumber(number) {
  return String(number).padStart(4, '0');
}

const problems = [];
const mergeBase = git('merge-base', base, 'HEAD');

// マージ済みのmigrationは、適用済みの環境で再実行されたり内容がずれたりするため変更しない。
const addedFiles = [];
const changes = splitLines(
  git(
    'diff',
    '--name-status',
    '--find-renames',
    mergeBase,
    'HEAD',
    '--',
    `${migrationsDirectory}/`
  )
);
for (const change of changes) {
  const [status, ...files] = change.split('\t');
  if (status === 'A') {
    addedFiles.push(files[0]);
  } else {
    problems.push(
      `${files.join(' -> ')}: マージ済みのmigrationは変更・改名・削除できません(${status})`
    );
  }
}

// 追加するmigrationは、PR先ブランチの最大番号より大きい、重複しない番号にする。
const baseMaxNumber = Math.max(
  0,
  ...splitLines(git('ls-tree', '--name-only', base, `${migrationsDirectory}/`))
    .map(getMigrationNumber)
    .filter(number => number !== null)
);
const addedMigrations = addedFiles.filter(file => file.endsWith('.sql'));
const addedFilesByNumber = new Map();
for (const file of addedMigrations) {
  const number = getMigrationNumber(file);
  if (number === null) {
    problems.push(
      `${file}: ファイル名は「4桁の番号_英小文字・数字・アンダースコア.sql」にしてください`
    );
    continue;
  }
  if (number <= baseMaxNumber) {
    problems.push(
      `${file}: 番号は${base}の最大番号(${formatNumber(baseMaxNumber)})より大きくしてください`
    );
  }
  addedFilesByNumber.set(number, [
    ...(addedFilesByNumber.get(number) ?? []),
    file,
  ]);
}
for (const [number, files] of addedFilesByNumber) {
  if (files.length > 1) {
    problems.push(
      `番号${formatNumber(number)}が重複しています: ${files.join(', ')}`
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `migrationの検査に成功しました(比較先: ${base}、追加: ${addedMigrations.length}件)`
);
