import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import { ScheduleEntity } from '../../domain/entities/Schedule';

// 手順1用のダミーデータ。手順4で D1 から取得する実装に差し替える。
// 0009のマイグレーションで作成したダミーデータと内容を一致済
const DUMMY_SCHEDULES: ScheduleEntity[] = [
  {
    f_schedule_id: 1,
    f_schedule_type: 'ceremony',
    f_name: '開会式',
    f_description: 'レク大会の開会を宣言するセレモニーです。',
    f_start_time: '09:00',
    f_end_time: '09:30',
    f_location: 'メインアリーナ',
    f_order: 1,
  },
  {
    f_schedule_id: 2,
    f_schedule_type: 'competition',
    f_name: '綱引き',
    f_description: 'チーム対抗の綱引き競技です。各チームから10名が参加します。',
    f_start_time: '09:45',
    f_end_time: '10:30',
    f_location: 'グラウンド A',
    f_order: 2,
  },
  {
    f_schedule_id: 3,
    f_schedule_type: 'competition',
    f_name: '玉入れ',
    f_description: '2分間で多くの玉をカゴに入れたチームの勝利です。',
    f_start_time: '10:30',
    f_end_time: '11:15',
    f_location: 'グラウンド B',
    f_order: 3,
  },
  {
    f_schedule_id: 4,
    f_schedule_type: 'other',
    f_name: 'パフォーマンス',
    f_description: 'パフォーマンスを行います。',
    f_start_time: '11:15',
    f_end_time: '12:15',
    f_location: 'メインアリーナ',
    f_order: 4,
  },
  {
    f_schedule_id: 5,
    f_schedule_type: 'competition',
    f_name: '借り物競走',
    f_description: 'お題のものを会場内で借りてゴールを目指す競技です。',
    f_start_time: '12:15',
    f_end_time: '13:00',
    f_location: 'グラウンド A',
    f_order: 5,
  },
  {
    f_schedule_id: 6,
    f_schedule_type: 'competition',
    f_name: 'リレー',
    f_description: 'チーム対抗4×100mリレー。各チームの代表4名が走ります。',
    f_start_time: '13:00',
    f_end_time: '14:00',
    f_location: 'トラック',
    f_order: 6,
  },
  {
    f_schedule_id: 7,
    f_schedule_type: 'competition',
    f_name: '障害物競走',
    f_description: 'さまざまな障害をクリアしながらゴールを目指します。',
    f_start_time: '14:00',
    f_end_time: '14:45',
    f_location: 'グラウンド B',
    f_order: 7,
  },
  {
    f_schedule_id: 8,
    f_schedule_type: 'competition',
    f_name: '大縄跳び',
    f_description: 'チーム全員で3分間に何回跳べるかを競います。',
    f_start_time: '14:45',
    f_end_time: '15:30',
    f_location: 'グラウンド A',
    f_order: 8,
  },
  {
    f_schedule_id: 9,
    f_schedule_type: 'ceremony',
    f_name: '表彰式',
    f_description: '各競技の優勝チームへの表彰を行います。',
    f_start_time: '15:30',
    f_end_time: '15:50',
    f_location: 'メインアリーナ',
    f_order: 9,
  },
  {
    f_schedule_id: 10,
    f_schedule_type: 'ceremony',
    f_name: '閉会式',
    f_description: 'レク大会の閉会を宣言するセレモニーです。',
    f_start_time: '15:50',
    f_end_time: '16:00',
    f_location: 'メインアリーナ',
    f_order: 10,
  },
];

export function createScheduleRepository(): IScheduleRepository {
  return {
    async findAll(): Promise<ScheduleEntity[]> {
      return [...DUMMY_SCHEDULES];
    },

    async findById(id: number): Promise<ScheduleEntity | null> {
      return DUMMY_SCHEDULES.find(s => s.f_schedule_id === id) ?? null;
    },
  };
}
