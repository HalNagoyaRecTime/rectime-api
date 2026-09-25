import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationAudienceResolverCandidate,
  UnresolvedNotificationAudience,
} from '../../../src/domain/entities/NotificationAudienceResolver';
import { UnresolvableNotificationAudienceError } from '../../../src/domain/entities/NotificationAudienceResolver';
import type { INotificationAudienceResolverRepository } from '../../../src/domain/interfaces/repositories/INotificationAudienceResolverRepository';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';

const audience: UnresolvedNotificationAudience = {
  notification_audience_id: 2,
  audience_type: 'all',
  target_id: null,
};

function buildRepository(
  overrides: Partial<INotificationAudienceResolverRepository> = {}
): INotificationAudienceResolverRepository {
  return {
    findDueCandidates: vi.fn().mockResolvedValue([]),
    claimScheduled: vi.fn().mockResolvedValue(true),
    findUnresolvedAudiences: vi.fn().mockResolvedValue([audience]),
    resolveAudience: vi.fn().mockResolvedValue(undefined),
    failSchedule: vi.fn().mockResolvedValue(true),
    completeScheduleIfResolved: vi.fn().mockResolvedValue(true),
    countRecipients: vi.fn().mockResolvedValue(3),
    ...overrides,
  };
}

const candidate = (
  id: number,
  send_status: 'scheduled' | 'resolving'
): NotificationAudienceResolverCandidate => ({
  notification_schedule_id: id,
  send_status,
});

describe('NotificationAudienceResolverService', () => {
  it('scheduledをclaimして未解決Audienceを順に解決し、DB件数を返す', async () => {
    const repository = buildRepository({
      findDueCandidates: vi.fn().mockResolvedValue([candidate(7, 'scheduled')]),
    });
    const service = createNotificationAudienceResolverService(repository);
    const now = new Date('2026-09-24T12:00:00.000Z');

    await expect(service.resolveDueSchedules(now)).resolves.toEqual({
      completed_schedules: [
        { notification_schedule_id: 7, recipient_count: 3 },
      ],
      failed_schedule_ids: [],
    });
    expect(repository.findDueCandidates).toHaveBeenCalledWith(
      now.toISOString(),
      100
    );
    expect(repository.claimScheduled).toHaveBeenCalledWith(
      7,
      now.toISOString()
    );
    expect(repository.resolveAudience).toHaveBeenCalledWith(
      7,
      audience,
      now.toISOString()
    );
    expect(repository.completeScheduleIfResolved).toHaveBeenCalledWith(
      7,
      now.toISOString()
    );
  });

  it('resolving中のscheduleを再開し、初回claimを繰り返さない', async () => {
    const repository = buildRepository({
      findDueCandidates: vi.fn().mockResolvedValue([candidate(8, 'resolving')]),
    });
    const service = createNotificationAudienceResolverService(repository);

    await service.resolveDueSchedules(new Date('2026-09-24T12:00:00.000Z'));

    expect(repository.claimScheduled).not.toHaveBeenCalled();
    expect(repository.findUnresolvedAudiences).toHaveBeenCalledWith(8);
  });

  it('他Workerがclaim済みならそのscheduleを処理しない', async () => {
    const repository = buildRepository({
      findDueCandidates: vi.fn().mockResolvedValue([candidate(9, 'scheduled')]),
      claimScheduled: vi.fn().mockResolvedValue(false),
    });
    const service = createNotificationAudienceResolverService(repository);

    await expect(
      service.resolveDueSchedules(new Date('2026-09-24T12:00:00.000Z'))
    ).resolves.toEqual({ completed_schedules: [], failed_schedule_ids: [] });
    expect(repository.findUnresolvedAudiences).not.toHaveBeenCalled();
    expect(repository.completeScheduleIfResolved).not.toHaveBeenCalled();
  });

  it('一つのscheduleで失敗しても他scheduleを進め、失敗側は未完了のままにする', async () => {
    const repository = buildRepository({
      findDueCandidates: vi
        .fn()
        .mockResolvedValue([
          candidate(10, 'resolving'),
          candidate(11, 'resolving'),
        ]),
      resolveAudience: vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary query failure'))
        .mockResolvedValueOnce(undefined),
      countRecipients: vi.fn().mockResolvedValue(4),
    });
    const service = createNotificationAudienceResolverService(repository);

    await expect(
      service.resolveDueSchedules(new Date('2026-09-24T12:00:00.000Z'))
    ).resolves.toEqual({
      completed_schedules: [
        { notification_schedule_id: 11, recipient_count: 4 },
      ],
      failed_schedule_ids: [10],
    });
    expect(repository.completeScheduleIfResolved).toHaveBeenCalledTimes(1);
    expect(repository.failSchedule).not.toHaveBeenCalled();
    expect(repository.completeScheduleIfResolved).toHaveBeenCalledWith(
      11,
      '2026-09-24T12:00:00.000Z'
    );
  });

  it('恒久的なAudience不整合はscheduleをfailedにする', async () => {
    const repository = buildRepository({
      findDueCandidates: vi
        .fn()
        .mockResolvedValue([candidate(12, 'resolving')]),
      resolveAudience: vi
        .fn()
        .mockRejectedValue(
          new UnresolvableNotificationAudienceError(
            2,
            'Audience 2 に対象IDがありません'
          )
        ),
    });
    const service = createNotificationAudienceResolverService(repository);
    const now = new Date('2026-09-24T12:00:00.000Z');

    await expect(service.resolveDueSchedules(now)).resolves.toEqual({
      completed_schedules: [],
      failed_schedule_ids: [12],
    });
    expect(repository.failSchedule).toHaveBeenCalledWith(
      12,
      'Audience 2 に対象IDがありません',
      now.toISOString()
    );
    expect(repository.completeScheduleIfResolved).not.toHaveBeenCalled();
  });
});
