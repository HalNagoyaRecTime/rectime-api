import { describe, expect, it, vi } from 'vitest';
import { createNotificationService } from '../../../src/application/services/NotificationService';
import type { INotificationRepository } from '../../../src/domain/interfaces/repositories/INotificationRepository';

function setup() {
  const repository: INotificationRepository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  };
  return { repository, service: createNotificationService(repository) };
}

describe('NotificationService', () => {
  it('通知内容をRepositoryへ渡して作成する', async () => {
    const { repository, service } = setup();
    const input = {
      notification_type: 'manual',
      title: '集合場所のお知らせ',
      body: '第1体育館へ集合してください。',
    };
    (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      notification_id: 1,
      ...input,
    });

    await service.createNotification(input);

    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('一覧条件をRepositoryへ渡す', async () => {
    const { repository, service } = setup();
    const options = { notification_type: 'manual', limit: 20, offset: 10 };
    (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.getNotifications(options);

    expect(repository.findAll).toHaveBeenCalledWith(options);
  });

  it('存在しない通知の詳細取得はNotification not foundを返す', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getNotificationById(999)).rejects.toThrow(
      'Notification not found'
    );
  });

  it('存在しない通知の更新はNotification not foundを返す', async () => {
    const { repository, service } = setup();
    (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      service.updateNotification(999, { title: '変更後' })
    ).rejects.toThrow('Notification not found');
  });
});
