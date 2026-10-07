import { describe, expect, it, vi } from 'vitest';
import {
  NotificationConfigError,
  createNotificationConfigService,
} from '../../../src/application/services/NotificationConfigService';
import type { INotificationConfigRepository } from '../../../src/domain/interfaces/repositories/INotificationConfigRepository';

function setup(available = true, count = 3) {
  const repository: INotificationConfigRepository = {
    areAudienceTargetsAvailable: vi.fn().mockResolvedValue(available),
    countAudienceUsers: vi.fn().mockResolvedValue(count),
  };
  return { repository, service: createNotificationConfigService(repository) };
}

describe('NotificationConfigService', () => {
  it('configは選択可能なimportanceだけを返し、highを含めない', () => {
    const { service } = setup();

    expect(service.getConfig()).toEqual({
      importance: { default: 'normal', options: ['low', 'normal'] },
    });
  });

  it('Audienceを変換して対象User数を返す', async () => {
    const { repository, service } = setup(true, 42);

    await expect(
      service.countAudience({
        audience: {
          items: [
            { type: 'event', targetId: 81 },
            { type: 'class_room', targetId: 12 },
          ],
        },
      })
    ).resolves.toEqual({ recipientCount: 42 });
    expect(repository.countAudienceUsers).toHaveBeenCalledWith([
      { type: 'event', target_id: 81 },
      { type: 'class_room', target_id: 12 },
    ]);
  });

  it('対象が存在しない場合は数えずにNOT_FOUNDを投げる', async () => {
    const { repository, service } = setup(false);

    await expect(
      service.countAudience({
        audience: { items: [{ type: 'user', targetId: 999 }] },
      })
    ).rejects.toEqual(
      new NotificationConfigError('NOTIFICATION_AUDIENCE_NOT_FOUND')
    );
    expect(repository.countAudienceUsers).not.toHaveBeenCalled();
  });
});
