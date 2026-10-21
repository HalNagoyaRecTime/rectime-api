export function normalizeMicrosoftEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    parts.some(part => /\s/u.test(part))
  ) {
    return null;
  }
  return normalized;
}

export function extractStudentIdNumber(
  email: string,
  studentEmailDomain: string
): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;
  if (!localPart || domain !== studentEmailDomain) return null;

  //"nhs"+ 数値 の形式に当てはまらない場合、学籍番号とみなさない
  // 抽出した数字列は、students.student_id_number(text型)の値と
  // 完全一致で照合される前提のため、先頭ゼロの有無を含め、
  // メールアドレスとDBの登録値の表記が揃っている必要がある
  // (例: メールが nhs00123 なら、DB側も "00123" である必要がある)。
  const match = localPart.match(/^nhs(\d+)$/);
  return match ? match[1] : null;
}

// 正規化前のメールアドレスが学生メール形式(学生ドメイン かつ nhs + 数字)か判定する。
export function isStudentEmail(
  email: string,
  studentEmailDomain: string
): boolean {
  const normalizedEmail = normalizeMicrosoftEmail(email);
  if (!normalizedEmail) return false;
  return (
    extractStudentIdNumber(
      normalizedEmail,
      studentEmailDomain.trim().toLowerCase()
    ) !== null
  );
}
