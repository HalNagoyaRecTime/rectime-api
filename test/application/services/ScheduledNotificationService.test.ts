import { describe, expect, it, vi } from 'vitest';
import { createScheduledNotificationService } from '../../../src/application/services/ScheduledNotificationService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationSendLogRepository } from '../../../src/domain/interfaces/repositories/INotificationSendLogRepository';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { EventEntity } from '../../../src/domain/entities/Event';
import type { FirebaseTokenEntity } from '../../../src/domain/entities/FirebaseToken';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    f_event_id: 1,
    f_event_code: 'E001',
    f_event_name: '徒競走',
    f_time: '1010',
    f_duration: '20',
    f_place: 'トラック',
    f_gather_time: '1000',
    f_summary: null,
    ...overrides,
  };
}

function buildToken(
  overrides: Partial<FirebaseTokenEntity> = {}
): FirebaseTokenEntity {
  return {
    id: 1,
    user_id: 1,
    platform: 'android',
    fcm_token: 'token-a',
    is_active: 1,
    last_seen_at: '2026-01-01',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

// テスト対象は now を JST HHMM に変換して 10 分後の時刻でイベントを検索するため、
// UTC 09:50 (= JST 18:50) の 10 分後 (JST 19:00) を基準に固定する
const NOW = new Date('2026-01-01T09:50:00.000Z');

describe('ScheduledNotificationService', () => {
  function setup() {
    const eventRepository: IEventRepository = {
      findAll: vi.fn().mockResolvedValue({ events: [], total: 0 }),
      findById: vi.fn(),
      findByEventCode: vi.fn(),
    };
    const firebaseTokenRepository: IFirebaseTokenRepository = {
      register: vi.fn(),
      findActiveTokens: vi.fn().mockResolvedValue([]),
      deactivate: vi.fn(),
    };
    const notificationSendLogRepository: INotificationSendLogRepository = {
      hasAlreadySent: vi.fn().mockResolvedValue(false),
      record: vi.fn(),
    };
    const fcmService: IFcmService = {
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi
        .fn()
        .mockResolvedValue({ success: true, messageId: 'msg-1' }),
    };
    const service = createScheduledNotificationService({
      eventRepository,
      firebaseTokenRepository,
      notificationSendLogRepository,
      fcmService,
    });
    return {
      service,
      eventRepository,
      firebaseTokenRepository,
      notificationSendLogRepository,
      fcmService,
    };
  }

  it('対象時刻のイベント・アクティブトークンごとに通知を送信し、送信ログを記録する', async () => {
    const {
      service,
      eventRepository,
      firebaseTokenRepository,
      notificationSendLogRepository,
      fcmService,
    } = setup();
    const event = buildEvent();
    const token = buildToken();
    (eventRepository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [event],
      total: 1,
    });
    (
      firebaseTokenRepository.findActiveTokens as ReturnType<typeof vi.fn>
    ).mockResolvedValue([token]);

    const result = await service.sendScheduledEventNotifications(NOW);

    expect(eventRepository.findAll).toHaveBeenCalledWith({ time: '1900' });
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith({
      token: 'token-a',
      title: '呼び出し通知',
      body: '徒競走の開始10分前です。トラックに集合してください。',
      data: { type: 'event_reminder', eventId: '1' },
    });
    expect(notificationSendLogRepository.record).toHaveBeenCalledWith({
      eventId: 1,
      firebaseTokenId: 1,
      scheduledForDate: '2026-01-01',
      messageId: 'msg-1',
    });
    expect(result).toEqual({ checkedEvents: 1, sent: 1, failed: 0 });
  });

  it('送信済みログがある場合はスキップする', async () => {
    const {
      service,
      eventRepository,
      firebaseTokenRepository,
      notificationSendLogRepository,
      fcmService,
    } = setup();
    (eventRepository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [buildEvent()],
      total: 1,
    });
    (
      firebaseTokenRepository.findActiveTokens as ReturnType<typeof vi.fn>
    ).mockResolvedValue([buildToken()]);
    (
      notificationSendLogRepository.hasAlreadySent as ReturnType<typeof vi.fn>
    ).mockResolvedValue(true);

    const result = await service.sendScheduledEventNotifications(NOW);

    expect(fcmService.sendNotificationToToken).not.toHaveBeenCalled();
    expect(notificationSendLogRepository.record).not.toHaveBeenCalled();
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 0 });
  });

  it('送信失敗時は failed をカウントし、無効トークンのエラーの場合はトークンを無効化する', async () => {
    const { service, eventRepository, firebaseTokenRepository, fcmService } =
      setup();
    (eventRepository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [buildEvent()],
      total: 1,
    });
    (
      firebaseTokenRepository.findActiveTokens as ReturnType<typeof vi.fn>
    ).mockResolvedValue([buildToken({ id: 42 })]);
    (
      fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('UNREGISTERED'));
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await service.sendScheduledEventNotifications(NOW);

    expect(firebaseTokenRepository.deactivate).toHaveBeenCalledWith(42);
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
    consoleErrorSpy.mockRestore();
  });

  it('無効トークン以外のエラーの場合はトークンを無効化しない', async () => {
    const { service, eventRepository, firebaseTokenRepository, fcmService } =
      setup();
    (eventRepository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      events: [buildEvent()],
      total: 1,
    });
    (
      firebaseTokenRepository.findActiveTokens as ReturnType<typeof vi.fn>
    ).mockResolvedValue([buildToken({ id: 42 })]);
    (
      fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('network error'));
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await service.sendScheduledEventNotifications(NOW);

    expect(firebaseTokenRepository.deactivate).not.toHaveBeenCalled();
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
    consoleErrorSpy.mockRestore();
  });

  it('対象イベントがない場合は checkedEvents 0 で終了する', async () => {
    const { service } = setup();

    const result = await service.sendScheduledEventNotifications(NOW);

    expect(result).toEqual({ checkedEvents: 0, sent: 0, failed: 0 });
  });
});
