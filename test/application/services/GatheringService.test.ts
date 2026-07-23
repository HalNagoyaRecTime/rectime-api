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
  event_name: '運動会',
  gathering_spot_name: '体育館前',
};

function setup() {
  const repository: IGatheringRepository = {
    findAll: vi.fn(),
    findByEventId: vi.fn(),
    existsGatheringGroup: vi.fn().mockResolvedValue(true),
    existsEvent: vi.fn().mockResolvedValue(true),
    existsGatheringSpot: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
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

    await expect(service.getAllGatherings()).resolves.toBe(gatherings);
    expect(repository.findAll).toHaveBeenCalledOnce();
  });

  it('イベントの存在を確認して集合予定を取得する', async () => {
    const { repository, service } = setup();
    (repository.findByEventId as ReturnType<typeof vi.fn>).mockResolvedValue(
      gathering
    );

    await expect(service.getGatheringByEventId(3)).resolves.toBe(gathering);
    expect(repository.existsEvent).toHaveBeenCalledWith(3);
    expect(repository.findByEventId).toHaveBeenCalledWith(3);
  });

  it('存在しないイベントでは集合予定を取得しない', async () => {
    const { repository, service } = setup();
    (repository.existsEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );

    await expect(service.getGatheringByEventId(999)).rejects.toThrow(
      'Event not found'
    );
    expect(repository.findByEventId).not.toHaveBeenCalled();
  });

  it('すべての参照先を確認後、入力をそのまま作成処理へ渡す', async () => {
    const { repository, service } = setup();
    const input = {
      gathering_group_id: 2,
      event_id: 3,
      gathering_spot_id: 4,
      gathering_time: '08:50',
      round: 1,
    };
    (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      gathering
    );

    await expect(service.createGathering(input)).resolves.toBe(gathering);
    expect(repository.existsGatheringGroup).toHaveBeenCalledWith(2);
    expect(repository.existsEvent).toHaveBeenCalledWith(3);
    expect(repository.existsGatheringSpot).toHaveBeenCalledWith(4);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('存在しないグループでは以降の確認と作成を行わない', async () => {
    const { repository, service } = setup();
    (
      repository.existsGatheringGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await expect(
      service.createGathering({
        gathering_group_id: 2,
        event_id: 3,
        gathering_spot_id: 4,
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
        gathering_group_id: 2,
        event_id: 3,
        gathering_spot_id: 4,
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
        gathering_group_id: 2,
        event_id: 3,
        gathering_spot_id: 4,
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
        gathering_group_id: 2,
        event_id: 3,
        gathering_spot_id: 4,
      })
    ).rejects.toThrow('database error');
  });
});
