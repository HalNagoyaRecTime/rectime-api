import { describe, expect, it, vi } from 'vitest';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';
import type { INotificationAudienceResolverRepository } from '../../../src/domain/interfaces/repositories/INotificationAudienceResolverRepository';

function setup() {
  const repository: INotificationAudienceResolverRepository = {
    findDueScheduleIds: vi.fn(),
    claimScheduleForResolution: vi.fn().mockResolvedValue(true),
    isScheduleResolutionAllowed: vi.fn().mockResolvedValue(true),
    findUnresolvedAudiences: vi.fn().mockResolvedValue([
      {
        id: 10,
        scheduleId: 1,
        audienceType: 'all',
        targetId: null,
      },
      {
        id: 11,
        scheduleId: 1,
        audienceType: 'user',
        targetId: 99,
      },
    ]),
    findAudienceUserIds: vi
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([2]),
    insertRecipients: vi.fn(),
    markAudienceResolved: vi.fn().mockResolvedValue(true),
    markRecipientsResolved: vi.fn().mockResolvedValue(true),
  };
  return {
    repository,
    service: createNotificationAudienceResolverService(repository),
  };
}

describe('NotificationAudienceResolverService', () => {
  it('claim後にAudienceを順番に解決し、Recipient完了を記録する', async () => {
    const { repository, service } = setup();

    await expect(
      service.resolveSchedule(1, new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      status: 'resolved',
      audienceCount: 2,
      recipientCount: 3,
    });

    expect(repository.claimScheduleForResolution).toHaveBeenCalledWith(
      1,
      '2026-09-21T09:00:00.000Z'
    );
    expect(repository.insertRecipients).toHaveBeenNthCalledWith(1, 1, [1, 2]);
    expect(repository.insertRecipients).toHaveBeenNthCalledWith(2, 1, [2]);
    expect(repository.markAudienceResolved).toHaveBeenNthCalledWith(
      1,
      10,
      '2026-09-21T09:00:00.000Z'
    );
    expect(repository.markRecipientsResolved).toHaveBeenCalledWith(
      1,
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('別Workerが先にclaimした場合は処理を重複実行しない', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.claimScheduleForResolution).mockResolvedValue(false);

    await expect(
      service.resolveSchedule(1, new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      status: 'skipped',
      audienceCount: 0,
      recipientCount: 0,
    });
    expect(repository.findUnresolvedAudiences).not.toHaveBeenCalled();
  });

  it('途中失敗時は後続Audienceをresolvedにせずエラーを再送出する', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.insertRecipients)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('D1 unavailable'));

    await expect(
      service.resolveSchedule(1, new Date('2026-09-21T09:00:00.000Z'))
    ).rejects.toThrow('D1 unavailable');
    expect(repository.markAudienceResolved).toHaveBeenCalledTimes(1);
    expect(repository.markAudienceResolved).toHaveBeenCalledWith(
      10,
      '2026-09-21T09:00:00.000Z'
    );
    expect(repository.markRecipientsResolved).not.toHaveBeenCalled();
  });

  it('Stop後は後続Audienceの解決を開始しない', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.isScheduleResolutionAllowed)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service.resolveSchedule(1, new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      status: 'skipped',
      audienceCount: 0,
      recipientCount: 2,
    });
    expect(repository.findAudienceUserIds).toHaveBeenCalledTimes(1);
    expect(repository.insertRecipients).toHaveBeenCalledTimes(1);
    expect(repository.markAudienceResolved).toHaveBeenCalledTimes(1);
    expect(repository.markRecipientsResolved).not.toHaveBeenCalled();
  });
});
