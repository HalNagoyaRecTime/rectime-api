import { describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleActionService } from '../../../src/application/services/NotificationScheduleActionService';
import type { NotificationScheduleActionSnapshot } from '../../../src/domain/entities/NotificationScheduleAction';

function harness(
  snapshot: Partial<NotificationScheduleActionSnapshot> = {},
  createStatus = 'created',
  cancelStatus = 'deleted'
) {
  const repo = {
    findActionSnapshot: vi.fn().mockResolvedValue({
      notification_id: 10,
      source_type: null,
      source_exists: true,
      send_status: 'scheduled',
      started_at: null,
      recipients_resolved_at: null,
      has_recipients: false,
      ...snapshot,
    }),
    createResend: vi.fn().mockResolvedValue({
      status: createStatus,
      notification_id: 10,
      notification_schedule_id: 20,
    }),
    cancelUnstarted: vi.fn().mockResolvedValue(cancelStatus),
  };
  return { repo, service: createNotificationScheduleActionService(repo) };
}
describe('NotificationScheduleActionService', () => {
  it.each([
    'scheduled',
    'resolving',
    'sending',
    'completed',
    'failed',
    'stopped',
  ] as const)('元status %sに依存せず即時再送を受け付ける', async status => {
    const h = harness({
      send_status: status,
      started_at: '2026-10-02T00:00:00Z',
    });
    const now = new Date('2026-10-03T00:00:00Z');
    expect(
      await h.service.resendSchedule(
        1,
        2,
        { delivery: { type: 'immediate', sendAt: null } },
        now
      )
    ).toEqual({ notificationId: 10, notificationScheduleId: 20 });
    expect(h.repo.createResend).toHaveBeenCalledWith({
      schedule_id: 1,
      actor_user_id: 2,
      send_at: now.toISOString(),
      now: now.toISOString(),
    });
  });
  it('予約再送の時刻をUTCへ変換する', async () => {
    const h = harness();
    await h.service.resendSchedule(1, 2, {
      delivery: { type: 'scheduled', sendAt: '2026-11-07T15:47:00+09:00' },
    });
    expect(h.repo.createResend).toHaveBeenCalledWith(
      expect.objectContaining({ send_at: '2026-11-07T06:47:00.000Z' })
    );
  });
  it('削除済みsource Gatheringのautomaticだけ再送を拒否する', async () => {
    const h = harness({ source_type: 'gathering', source_exists: false });
    await expect(
      h.service.resendSchedule(1, 2, {
        delivery: { type: 'immediate', sendAt: null },
      })
    ).rejects.toMatchObject({ code: 'NOTIFICATION_RESEND_NOT_ALLOWED' });
    expect(h.repo.createResend).not.toHaveBeenCalled();
  });
  it.each([
    ['not_found', 'NOTIFICATION_SCHEDULE_NOT_FOUND'],
    ['not_allowed', 'NOTIFICATION_RESEND_NOT_ALLOWED'],
  ])('再送保存時の%sを共通Errorにする', async (result, code) => {
    await expect(
      harness({}, result).service.resendSchedule(1, 2, {
        delivery: { type: 'immediate', sendAt: null },
      })
    ).rejects.toMatchObject({ code });
  });
  it('未開始Scheduleを取消する', async () => {
    const h = harness();
    await h.service.cancelSchedule(1);
    expect(h.repo.cancelUnstarted).toHaveBeenCalledWith(1);
  });
  it.each([
    { started_at: '2026-10-03T00:00:00Z' },
    { send_status: 'sending' as const },
    { send_status: 'resolving' as const },
    { recipients_resolved_at: '2026-10-03T00:00:00Z' },
    { has_recipients: true },
  ])('Worker開始済みの条件%sではDELETEを呼ばない', async snapshot => {
    const h = harness(snapshot);
    await expect(h.service.cancelSchedule(1)).rejects.toMatchObject({
      code: 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
    });
    expect(h.repo.cancelUnstarted).not.toHaveBeenCalled();
  });
  it.each([
    ['not_found', 'NOTIFICATION_SCHEDULE_NOT_FOUND'],
    ['not_allowed', 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED'],
  ])('DELETE時の%sを共通Errorにする', async (result, code) => {
    await expect(
      harness({}, 'created', result).service.cancelSchedule(1)
    ).rejects.toMatchObject({ code });
  });
  it('存在しないScheduleは再送・取消とも404契約になる', async () => {
    const h = harness();
    h.repo.findActionSnapshot.mockResolvedValue(null);
    await expect(h.service.cancelSchedule(1)).rejects.toMatchObject({
      code: 'NOTIFICATION_SCHEDULE_NOT_FOUND',
    });
    await expect(
      h.service.resendSchedule(1, 2, {
        delivery: { type: 'immediate', sendAt: null },
      })
    ).rejects.toMatchObject({ code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' });
  });
});
