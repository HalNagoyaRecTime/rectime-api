import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationStopService,
  NotificationStopError,
} from '../../../src/application/services/NotificationStopService';

describe('NotificationStopService', () => {
  it('manualはsendingのみを許可し認証Userを保存する', async () => {
    const stopSchedule = vi.fn().mockResolvedValue('stopped');
    const now = new Date('2026-10-03T00:00:00Z');
    expect(
      await createNotificationStopService({ stopSchedule }).stopSchedule(
        { scheduleId: 1, reason: 'manual', stoppedByUserId: 10 },
        now
      )
    ).toEqual({ notificationScheduleId: 1, status: 'stopped' });
    expect(stopSchedule).toHaveBeenCalledWith({
      schedule_id: 1,
      reason: 'manual',
      stopped_by_user_id: 10,
      allowed_statuses: ['sending'],
      now: now.toISOString(),
    });
  });
  it('source_deletedはresolving・sendingを許可しUserをNULLにする', async () => {
    const stopSchedule = vi.fn().mockResolvedValue('stopped');
    await createNotificationStopService({ stopSchedule }).stopSchedule({
      scheduleId: 1,
      reason: 'source_deleted',
    });
    expect(stopSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'source_deleted',
        stopped_by_user_id: null,
        allowed_statuses: ['resolving', 'sending'],
      })
    );
  });
  it.each([
    ['not_found', 'NOTIFICATION_SCHEDULE_NOT_FOUND'],
    ['not_allowed', 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'],
  ])('%sを共通契約のErrorにする', async (result, code) => {
    await expect(
      createNotificationStopService({
        stopSchedule: vi.fn().mockResolvedValue(result),
      }).stopSchedule({ scheduleId: 1, reason: 'manual', stoppedByUserId: 10 })
    ).rejects.toEqual(
      new NotificationStopError(code as NotificationStopError['code'])
    );
  });
});
