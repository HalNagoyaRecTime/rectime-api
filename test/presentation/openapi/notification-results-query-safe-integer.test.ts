import { describe, expect, it } from 'vitest';
import { notificationResultsQuery } from '../../../src/presentation/openapi/notification/commonSchemas';

describe('Notification Results queryのsafe integer境界', () => {
  it('pageはMAX_SAFE_INTEGERまで許可し、それを超える値を拒否する', () => {
    expect(
      notificationResultsQuery.safeParse({
        page: String(Number.MAX_SAFE_INTEGER),
        limit: '1',
      }).success
    ).toBe(true);

    expect(
      notificationResultsQuery.safeParse({
        page: String(Number.MAX_SAFE_INTEGER + 1),
        limit: '1',
      }).success
    ).toBe(false);

    expect(
      notificationResultsQuery.safeParse({
        page: '9'.repeat(100),
        limit: '1',
      }).success
    ).toBe(false);
  });
});
