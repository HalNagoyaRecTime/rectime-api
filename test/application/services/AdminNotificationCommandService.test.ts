import { describe, expect, it, vi } from 'vitest';
import type {
  CreateNotificationCommand,
  NotificationMutationSnapshot,
} from '../../../src/domain/entities/AdminNotificationCommand';
import type {
  AdminNotificationDetailDTO,
  NotificationPatchRequestDTO,
} from '../../../src/application/dto/AdminNotificationDTO';
import type { IAdminNotificationCommandRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationCommandRepository';
import type { IAdminNotificationQueryService } from '../../../src/application/services/IAdminNotificationQueryService';
import {
  AdminNotificationCommandError,
  createAdminNotificationCommandService,
} from '../../../src/application/services/AdminNotificationCommandService';

const notificationDetail: AdminNotificationDetailDTO = {
  notificationId: 10,
  content: {
    push: { title: 'Push title', body: 'Push body' },
    detail: { title: 'Detail title', body: 'Detail body' },
  },
  importance: 'normal',
  creation: { method: 'manual', user: null, source: null },
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  schedules: [],
};

function buildRepository(
  overrides: Partial<IAdminNotificationCommandRepository> = {}
): IAdminNotificationCommandRepository {
  return {
    areAudienceTargetsAvailable: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue({
      notification_id: 10,
      notification_schedule_id: 11,
    }),
    findMutationSnapshot: vi.fn(),
    update: vi.fn().mockResolvedValue('updated'),
    deleteUnstartedManual: vi.fn().mockResolvedValue('deleted'),
    ...overrides,
  };
}

function buildQueryService(
  overrides: Partial<IAdminNotificationQueryService> = {}
): IAdminNotificationQueryService {
  return {
    getAdminNotifications: vi.fn().mockResolvedValue({ items: [] }),
    getAdminNotificationById: vi.fn().mockResolvedValue(notificationDetail),
    ...overrides,
  };
}

function buildService(repository: IAdminNotificationCommandRepository) {
  return createAdminNotificationCommandService(repository, buildQueryService());
}

const createRequest = {
  content: {
    push: { title: 'Push title', body: 'Push body' },
    detail: { title: 'Detail title', body: 'Detail body' },
  },
  audience: {
    items: [
      { type: 'all' as const },
      { type: 'class_room' as const, targetId: 5 },
      { type: 'class_room' as const, targetId: 5 },
    ],
  },
  delivery: { type: 'immediate' as const, sendAt: null },
  importance: 'low' as const,
};

function mutationSnapshot(
  startedAt: string | null
): NotificationMutationSnapshot {
  return {
    notification_id: 10,
    source_type: null,
    schedules: [{ notification_schedule_id: 11, started_at: startedAt }],
  };
}

describe('AdminNotificationCommandService', () => {
  it('immediateを受付時刻へ変換し、Audience重複を除いて作成する', async () => {
    const repository = buildRepository();
    const service = buildService(repository);
    const before = Date.now();

    await expect(service.createNotification(3, createRequest)).resolves.toEqual(
      { notificationId: 10, notificationScheduleId: 11 }
    );

    const command = vi.mocked(repository.create).mock.calls[0][0];
    expect(Date.parse(command.now)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(command.send_at)).toBeGreaterThanOrEqual(before);
    expect(command.send_at).toBe(command.now);
    expect(command).toMatchObject({
      actor_user_id: 3,
      importance: 'low',
      audiences: [
        { type: 'all', target_id: null },
        { type: 'class_room', target_id: 5 },
      ],
    } satisfies Partial<CreateNotificationCommand>);
  });

  it('scheduledの指定時刻をUTCへ正規化する', async () => {
    const repository = buildRepository();
    const service = buildService(repository);

    await service.createNotification(3, {
      ...createRequest,
      delivery: {
        type: 'scheduled',
        sendAt: '2026-09-24T20:00:00+09:00',
      },
    });

    expect(vi.mocked(repository.create).mock.calls[0][0].send_at).toBe(
      '2026-09-24T11:00:00.000Z'
    );
  });

  it('上位権限契約がないhighは作成前に拒否する', async () => {
    const repository = buildRepository();
    const service = buildService(repository);

    await expect(
      service.createNotification(3, { ...createRequest, importance: 'high' })
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN',
    } satisfies Partial<AdminNotificationCommandError>);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('更新成功後にQuery Serviceからdetail DTOを取得する', async () => {
    const callOrder: string[] = [];
    const repository = buildRepository({
      findMutationSnapshot: vi
        .fn()
        .mockResolvedValue(mutationSnapshot('2026-09-24T10:00:00.000Z')),
      update: vi.fn().mockImplementation(async () => {
        callOrder.push('update');
        return 'updated';
      }),
    });
    const queryService = buildQueryService({
      getAdminNotificationById: vi.fn().mockImplementation(async () => {
        callOrder.push('detail');
        return notificationDetail;
      }),
    });
    const service = createAdminNotificationCommandService(
      repository,
      queryService
    );

    await expect(
      service.patchNotification(10, {
        content: { detail: { title: '更新detail' } },
      })
    ).resolves.toEqual(notificationDetail);
    expect(callOrder).toEqual(['update', 'detail']);
    expect(queryService.getAdminNotificationById).toHaveBeenCalledWith(10);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 10,
        detail_title: '更新detail',
        requires_unstarted_schedules: false,
      })
    );
  });

  it.each([
    ['push', { content: { push: { title: '更新push' } } }],
    ['importance', { importance: 'normal' }],
    [
      'audience',
      {
        schedule: {
          notificationScheduleId: 11,
          audience: { items: [{ type: 'all' }] },
        },
      },
    ],
    [
      'delivery',
      {
        schedule: {
          notificationScheduleId: 11,
          delivery: { type: 'scheduled', sendAt: '2026-09-25T10:00:00Z' },
        },
      },
    ],
  ] as const)('開始済み通知の%s編集を拒否する', async (_field, request) => {
    const repository = buildRepository({
      findMutationSnapshot: vi
        .fn()
        .mockResolvedValue(mutationSnapshot('2026-09-24T10:00:00.000Z')),
    });
    const service = buildService(repository);

    await expect(
      service.patchNotification(10, request as NotificationPatchRequestDTO)
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EDIT_NOT_ALLOWED' });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('開始済みまたはautomatic通知の削除を拒否する', async () => {
    const startedRepository = buildRepository({
      findMutationSnapshot: vi
        .fn()
        .mockResolvedValue(mutationSnapshot('2026-09-24T10:00:00.000Z')),
    });
    const startedService = buildService(startedRepository);
    await expect(startedService.deleteNotification(10)).rejects.toMatchObject({
      code: 'NOTIFICATION_DELETE_NOT_ALLOWED',
    });
    expect(startedRepository.deleteUnstartedManual).not.toHaveBeenCalled();

    const automaticSnapshot = {
      ...mutationSnapshot(null),
      source_type: 'gathering' as const,
    };
    const automaticRepository = buildRepository({
      findMutationSnapshot: vi.fn().mockResolvedValue(automaticSnapshot),
    });
    const automaticService = buildService(automaticRepository);
    await expect(automaticService.deleteNotification(10)).rejects.toMatchObject(
      { code: 'NOTIFICATION_DELETE_NOT_ALLOWED' }
    );
    expect(automaticRepository.deleteUnstartedManual).not.toHaveBeenCalled();
  });
  it('別NotificationのSchedule IDを拒否する', async () => {
    const repository = buildRepository({
      findMutationSnapshot: vi.fn().mockResolvedValue(mutationSnapshot(null)),
    });
    const service = buildService(repository);

    await expect(
      service.patchNotification(10, {
        schedule: {
          notificationScheduleId: 99,
          delivery: { type: 'scheduled', sendAt: '2026-09-25T10:00:00Z' },
        },
      })
    ).rejects.toMatchObject({ code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' });
    expect(repository.update).not.toHaveBeenCalled();
  });
});
