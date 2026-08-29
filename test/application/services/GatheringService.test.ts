import { describe, expect, it, vi } from 'vitest';
import { createGatheringService } from '../../../src/application/services/GatheringService';
import type { IGatheringRepository } from '../../../src/domain/interfaces/repositories/IGatheringRepository';

const gathering = {
  gathering_id: 1,
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
    findByEventId: vi.fn(),
    existsEvent: vi.fn().mockResolvedValue(true),
    existsGatheringSpot: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
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

    await expect(service.getAllGatherings()).resolves.toBe(gatherings);
    expect(repository.findAll).toHaveBeenCalledOnce();
  });

  it('競技の存在を確認して、その競技の集合予定一覧を取得する', async () => {
    const { repository, service } = setup();
    (repository.findByEventId as ReturnType<typeof vi.fn>).mockResolvedValue([
      gathering,
    ]);

    await expect(service.getGatheringsByEventId(3)).resolves.toEqual([
      gathering,
    ]);
    expect(repository.existsEvent).toHaveBeenCalledWith(3);
    expect(repository.findByEventId).toHaveBeenCalledWith(3);
  });

  it('存在しない競技では集合予定を取得しない', async () => {
    const { repository, service } = setup();
    (repository.existsEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );

    await expect(service.getGatheringsByEventId(999999)).rejects.toThrow(
      'Event not found'
    );
    expect(repository.findByEventId).not.toHaveBeenCalled();
  });

  it('競技と集合場所を確認後、入力を作成処理へ渡す', async () => {
    const { repository, service } = setup();
    const input = {
      event_id: 3,
      gathering_spot_id: 4,
      gathering_time: '08:50',
      round: 1,
    };
    (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      gathering
    );

    await expect(service.createGathering(input)).resolves.toBe(gathering);
    expect(repository.existsEvent).toHaveBeenCalledWith(3);
    expect(repository.existsGatheringSpot).toHaveBeenCalledWith(4);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('存在しない競技では集合場所の確認と作成を行わない', async () => {
    const { repository, service } = setup();
    (repository.existsEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );

    await expect(
      service.createGathering({
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
        event_id: 3,
        gathering_spot_id: 4,
      })
    ).rejects.toThrow('Gathering spot not found');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('集合予定を削除する', async () => {
    const { repository, service } = setup();

    await expect(service.deleteGathering(1)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(1);
  });

  it('存在しない集合予定の削除はエラーにする', async () => {
    const { repository, service } = setup();
    (repository.remove as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(service.deleteGathering(999999)).rejects.toThrow(
      'Gathering not found'
    );
  });
});
