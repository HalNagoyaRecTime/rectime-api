import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toValidationErrorDetails } from '../../../src/presentation/errors/validationErrorDetails';

describe('toValidationErrorDetails', () => {
  const schema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
  });

  it('fieldErrors と formErrors を公開契約として返す', () => {
    const result = schema.safeParse({ title: '', body: '' });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(toValidationErrorDetails(result.error)).toEqual({
      fieldErrors: {
        title: ['String must contain at least 1 character(s)'],
        body: ['String must contain at least 1 character(s)'],
      },
      formErrors: [],
    });
  });

  it('項目に紐づかないエラーは formErrors に保持する', () => {
    const result = schema
      .refine(value => value.title !== value.body, {
        message: 'title と body は同じ値にできません',
      })
      .safeParse({ title: '同じ', body: '同じ' });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(toValidationErrorDetails(result.error)).toEqual({
      fieldErrors: {},
      formErrors: ['title と body は同じ値にできません'],
    });
  });
});
