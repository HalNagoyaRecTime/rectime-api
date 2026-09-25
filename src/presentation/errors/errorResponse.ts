import type { Context } from 'hono';

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 500 | 503;

export type ApiErrorDefinition<
  S extends ErrorStatus = ErrorStatus,
  C extends string = string,
  M extends string = string,
> = {
  readonly status: S;
  readonly code: C;
  readonly message: M;
};

export function errorResponse<
  const S extends ErrorStatus,
  const C extends string,
  const M extends string,
>(
  c: Context,
  error: ApiErrorDefinition<S, C, M>,
  ...args: S extends 500 | 503 ? [] : [details?: unknown]
) {
  const details = normalizeErrorDetails((args as [unknown?])[0]);
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(details === undefined ? {} : { details }),
      },
    },
    error.status
  );
}

function normalizeErrorDetails(details: unknown): unknown {
  if (!isRecord(details)) return details;

  const fieldErrors = details.fieldErrors;
  const formErrors = details.formErrors;
  if (!isRecord(fieldErrors) || !Array.isArray(formErrors)) return details;

  const normalizedFieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages)) {
      normalizedFieldErrors[field] = messages.filter(isString);
    }
  }

  return {
    fieldErrors: normalizedFieldErrors,
    formErrors: formErrors.filter(isString),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
