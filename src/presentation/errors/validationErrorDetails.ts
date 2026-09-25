import type { ZodError } from 'zod';

export type ValidationErrorDetails = {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
};

/**
 * Zodの検証エラーを公開APIのエラー契約へ変換する。
 * Zodの`issues`配列はAPI利用者へ意図的に公開しない。
 */
export function toValidationErrorDetails(
  error: ZodError
): ValidationErrorDetails {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(messages)) fieldErrors[field] = messages;
  }

  return {
    fieldErrors,
    formErrors: flattened.formErrors,
  };
}
