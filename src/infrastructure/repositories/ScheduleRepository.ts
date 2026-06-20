import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import { ScheduleEntity } from '../../domain/entities/Schedule';

const DUMMY_SCHEDULES: ScheduleEntity[] = [
  {
    schedule_id: 1,
    schedule_type: 'ceremony',
    name: '開会式',
    description: 'レク大会の開会を宣言するセレモニーです。',
    start_time: '09:00',
    end_time: '09:30',
    location: 'メインアリーナ',
    order: 1,
  },
  {
    schedule_id: 2,
    schedule_type: 'competition',
    name: '綱引き',
    description: 'チーム対抗の綱引き競技です。各チームから10名が参加します。',
    start_time: '09:45',
    end_time: '10:30',
    location: 'グラウンド A',
    order: 2,
  },
  {
    schedule_id: 3,
    schedule_type: 'competition',
    name: '玉入れ',
    description: '2分間で多くの玉をカゴに入れたチームの勝利です。',
    start_time: '10:30',
    end_time: '11:15',
    location: 'グラウンド B',
    order: 3,
  },
  {
    schedule_id: 4,
    schedule_type: 'break',
    name: '昼休憩',
    description: 'お弁当・自由時間',
    start_time: '11:15',
    end_time: '12:15',
    location: null,
    order: 4,
  },
  {
    schedule_id: 5,
    schedule_type: 'competition',
    name: '借り物競走',
    description: 'お題のものを会場内で借りてゴールを目指す競技です。',
    start_time: '12:15',
    end_time: '13:00',
    location: 'グラウンド A',
    order: 5,
  },
  {
    schedule_id: 6,
    schedule_type: 'competition',
    name: 'リレー',
    description: 'チーム対抗4×100mリレー。各チームの代表4名が走ります。',
    start_time: '13:00',
    end_time: '14:00',
    location: 'トラック',
    order: 6,
  },
  {
    schedule_id: 7,
    schedule_type: 'competition',
    name: '障害物競走',
    description: 'さまざまな障害をクリアしながらゴールを目指します。',
    start_time: '14:00',
    end_time: '14:45',
    location: 'グラウンド B',
    order: 7,
  },
  {
    schedule_id: 8,
    schedule_type: 'competition',
    name: '大縄跳び',
    description: 'チーム全員で3分間に何回跳べるかを競います。',
    start_time: '14:45',
    end_time: '15:30',
    location: 'グラウンド A',
    order: 8,
  },
  {
    schedule_id: 9,
    schedule_type: 'ceremony',
    name: '表彰式',
    description: '各競技の優勝チームへの表彰を行います。',
    start_time: '15:30',
    end_time: '15:50',
    location: 'メインアリーナ',
    order: 9,
  },
  {
    schedule_id: 10,
    schedule_type: 'ceremony',
    name: '閉会式',
    description: 'レク大会の閉会を宣言するセレモニーです。',
    start_time: '15:50',
    end_time: '16:00',
    location: 'メインアリーナ',
    order: 10,
  },
];

export function createScheduleRepository(): IScheduleRepository {
  const findAll = async (): Promise<ScheduleEntity[]> => {
    return DUMMY_SCHEDULES.slice().sort((a, b) => a.order - b.order);
  };

  const findById = async (id: number): Promise<ScheduleEntity | null> => {
    return DUMMY_SCHEDULES.find(s => s.schedule_id === id) ?? null;
  };

  return { findAll, findById };
}
