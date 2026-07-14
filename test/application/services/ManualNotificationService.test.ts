import { describe, expect, it, vi } from 'vitest';
import { createManualNotificationService } from '../../../src/application/services/ManualNotificationService';
import { IFcmService } from '../../../src/application/services/IFcmService';
import { FirebaseTokenEntity } from '../../../src/domain/entities/FirebaseToken';
import { IManualNotificationRepository } from '../../../src/domain/interfaces/repositories/IManualNotificationRepository';
import { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

function createToken(id: number, fcmToken: string): FirebaseTokenEntity {
  return {
    id,
    user_id: id,
    platform: 'ios',
    fcm_token: fcmToken,
    is_active: 1,
    last_seen_at: '2026-07-10T00:00:00Z',
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  };
}

describe('ManualNotificationService', () => {
  it('全体通知をpriority 2固定で送信する', async () => {
    const manualNotificationRepository = {
      create: vi.fn().mockResolvedValue({
        id: 10,
        type: 'manual',
        title: '全体連絡',
        body: '体育館前に集合してください。',
        createdAt: '2026-07-10T00:00:00Z',
      }),
    } satisfies IManualNotificationRepository;
    const firebaseTokenRepository = {
      register: vi.fn(),
      findActiveTokensForEvent: vi.fn(),
      findActiveTokensForAllUsers: vi
        .fn()
        .mockResolvedValue([createToken(1, 'token-1')]),
      findActiveTokensForGroups: vi.fn(),
      deactivate: vi.fn().mockResolvedValue(undefined),
    } satisfies IFirebaseTokenRepository;
    const fcmService = {
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'message-1',
      }),
    } satisfies IFcmService;

    const service = createManualNotificationService({
      manualNotificationRepository,
      firebaseTokenRepository,
      fcmService,
    });

    const result = await service.sendManualNotification({
      title: '全体連絡',
      body: '体育館前に集合してください。',
      targetType: 'all',
      targetIds: ['ignored'],
    });

    expect(manualNotificationRepository.create).toHaveBeenCalledWith({
      title: '全体連絡',
      body: '体育館前に集合してください。',
    });
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith({
      token: 'token-1',
      title: '全体連絡',
      body: '体育館前に集合してください。',
      data: {
        type: 'manual',
        notificationId: '10',
        priority: '2',
      },
    });
    expect(result).toEqual({
      notificationId: 10,
      targetType: 'all',
      targetIds: [],
      priority: 2,
      tokens: 1,
      sent: 1,
      failed: 0,
    });
  });

  it('グループ通知では指定されたtargetIdsのトークンを取得する', async () => {
    const manualNotificationRepository = {
      create: vi.fn().mockResolvedValue({
        id: 11,
        type: 'manual',
        title: 'グループ連絡',
        body: '集合してください。',
        createdAt: '2026-07-10T00:00:00Z',
      }),
    } satisfies IManualNotificationRepository;
    const firebaseTokenRepository = {
      register: vi.fn(),
      findActiveTokensForEvent: vi.fn(),
      findActiveTokensForAllUsers: vi.fn(),
      findActiveTokensForGroups: vi
        .fn()
        .mockResolvedValue([createToken(2, 'token-2')]),
      deactivate: vi.fn().mockResolvedValue(undefined),
    } satisfies IFirebaseTokenRepository;
    const fcmService = {
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'message-2',
      }),
    } satisfies IFcmService;

    const service = createManualNotificationService({
      manualNotificationRepository,
      firebaseTokenRepository,
      fcmService,
    });

    await service.sendManualNotification({
      title: 'グループ連絡',
      body: '集合してください。',
      targetType: 'group',
      targetIds: ['1'],
    });

    expect(
      firebaseTokenRepository.findActiveTokensForGroups
    ).toHaveBeenCalledWith(['1']);
  });
});
