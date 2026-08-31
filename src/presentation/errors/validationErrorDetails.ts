import type { ZodError } from 'zod';

export type ValidationErrorDetails = {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
};

/**
 * Converts a Zod validation error to the public API error contract.
 * Zod's `issues` array is intentionally not exposed to API consumers.
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
