import { describe, expect, it } from 'vitest';
import {
  buildEventNotificationSendAt,
  isEventDate,
  isValidEventDate,
  toJstDateString,
} from '../../src/lib/eventDate';

describe('eventDate', () => {
  it('UTC日時をJSTの開催日に変換する', () => {
    expect(toJstDateString(new Date('2026-11-06T15:00:00.000Z'))).toBe(
      '2026-11-07'
    );
    expect(toJstDateString(new Date('2026-11-07T14:59:59.999Z'))).toBe(
      '2026-11-07'
    );
  });

  it('JSTの開催日だけを配信対象にする', () => {
    expect(
      isEventDate('2026-11-07', new Date('2026-11-06T15:00:00.000Z'))
    ).toBe(true);
    expect(
      isEventDate('2026-11-07', new Date('2026-11-07T14:59:59.999Z'))
    ).toBe(true);
    expect(
      isEventDate('2026-11-07', new Date('2026-11-06T14:59:59.999Z'))
    ).toBe(false);
    expect(
      isEventDate('2026-11-07', new Date('2026-11-07T15:00:00.000Z'))
    ).toBe(false);
  });

  it('未設定または不正な開催日では配信対象にしない', () => {
    expect(isValidEventDate(undefined)).toBe(false);
    expect(isValidEventDate('2026/11/07')).toBe(false);
    expect(isValidEventDate('2026-02-30')).toBe(false);
    expect(isValidEventDate('2026-11-07')).toBe(true);
    expect(isEventDate(undefined, new Date('2026-11-07T00:00:00Z'))).toBe(
      false
    );
  });

  it('開催日とHHMMからJSTの15分前をISO 8601で作る', () => {
    expect(buildEventNotificationSendAt('2026-11-07', '1030')).toBe(
      '2026-11-07T01:15:00.000Z'
    );
    expect(buildEventNotificationSendAt('2026-11-07', '0005')).toBe(
      '2026-11-06T14:50:00.000Z'
    );
  });
});
