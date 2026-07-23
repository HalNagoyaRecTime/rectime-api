import { describe, expect, it, vi } from 'vitest';
import { createGatheringService } from '../../../src/application/services/GatheringService';
import type { IGatheringRepository } from '../../../src/domain/interfaces/repositories/IGatheringRepository';

const gathering = {
  gathering_id: 1,
  gathering_group_id: 2,
  event_id: 3,
  gathering_spot_id: 4,
  gathering_time: '08:50',
  round: 1,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  event_name: '運動会',
  gathering_spot_name: '体育館前',
};

function setup() {
  const repository: IGatheringRepository = {
    findAll: vi.fn(),
    existsGatheringGroup: vi.fn().mockResolvedValue(true),
    existsEvent: vi.fn().mockResolvedValue(true),
    existsGatheringSpot: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
    findGatheringGroupId: vi.fn().mockResolvedValue(2),
    hasNotificationSchedules: vi.fn().mockResolvedValue(false),
    remove: vi.fn().mockResolvedValue(true),
  };
  return { repository, service: createGatheringService(repository) };
}

describe('GatheringService', () => {
  it('一覧取得をRepositoryへ委譲する', async () => {
    const { repository, service } = setup();
    const gatherings = [gathering];
    (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(
      gatherings
    );

    await expect(service.getAllGatherings()).resolves.toEqual(gatherings);
    expect(repository.findAll).toHaveBeenCalledOnce();
  });

  it('すべての参照先を確認後、入力をそのまま作成処理へ渡す', async () => {
    const { repository, service } = setup();
    const input = {
      gatheringGroupId: 2,
      eventId: 3,
      gatheringSpotId: 4,
      gatheringTime: '08:50',
      round: 1,
    };
    (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      gathering
    );

    await expect(service.createGathering(input)).resolves.toEqual(gathering);
    expect(repository.existsGatheringGroup).toHaveBeenCalledWith(2);
    expect(repository.existsEvent).toHaveBeenCalledWith(3);
    expect(repository.existsGatheringSpot).toHaveBeenCalledWith(4);
    expect(repository.create).toHaveBeenCalledWith({
      gathering_group_id: 2,
      event_id: 3,
      gathering_spot_id: 4,
      gathering_time: '08:50',
      round: 1,
    });
  });

  it('存在しないグループでは以降の確認と作成を行わない', async () => {
    const { repository, service } = setup();
    (
      repository.existsGatheringGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await expect(
      service.createGathering({
        gatheringGroupId: 2,
        eventId: 3,
        gatheringSpotId: 4,
      })
    ).rejects.toThrow('Gathering group not found');
    expect(repository.existsEvent).not.toHaveBeenCalled();
    expect(repository.existsGatheringSpot).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('存在しないイベントでは集合場所の確認と作成を行わない', async () => {
    const { repository, service } = setup();
    (repository.existsEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );

    await expect(
      service.createGathering({
        gatheringGroupId: 2,
        eventId: 3,
        gatheringSpotId: 4,
      })
    ).rejects.toThrow('Event not found');
    expect(repository.existsGatheringSpot).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('存在しない集合場所では作成を行わない', async () => {
    const { repository, service } = setup();
    (
      repository.existsGatheringSpot as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await expect(
      service.createGathering({
        gatheringGroupId: 2,
        eventId: 3,
        gatheringSpotId: 4,
      })
    ).rejects.toThrow('Gathering spot not found');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('作成処理の例外をそのまま送出する', async () => {
    const { repository, service } = setup();
    (repository.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    await expect(
      service.createGathering({
        gatheringGroupId: 2,
        eventId: 3,
        gatheringSpotId: 4,
      })
    ).rejects.toThrow('database error');
  });

  it('通知予定に使われていない集合設定を削除する', async () => {
    const { repository, service } = setup();

    await expect(service.deleteGathering(1)).resolves.toBeUndefined();
    expect(repository.findGatheringGroupId).toHaveBeenCalledWith(1);
    expect(repository.hasNotificationSchedules).toHaveBeenCalledWith(2);
    expect(repository.remove).toHaveBeenCalledWith(1);
  });

  it('存在しない集合設定と通知予定に使われる集合設定を削除しない', async () => {
    const { repository, service } = setup();
    (
      repository.findGatheringGroupId as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);

    await expect(service.deleteGathering(1)).rejects.toThrow(
      'Gathering not found'
    );
    expect(repository.remove).not.toHaveBeenCalled();

    (
      repository.findGatheringGroupId as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(2);
    (
      repository.hasNotificationSchedules as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(true);
    await expect(service.deleteGathering(2)).rejects.toThrow(
      'Gathering is in use by notification schedules'
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
