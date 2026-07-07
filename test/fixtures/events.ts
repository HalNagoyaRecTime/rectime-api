import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  entries,
  events,
  notification_send_logs,
} from '../../src/infrastructure/database/schema';

const EVENTS = [
  {
    eventCode: 'REC001',
    name: 'バスケットボール大会',
    time: '1100',
    duration: '120',
    place: '体育館',
    gatherTime: '1050',
    summary: '3on3バスケットボールトーナメント',
  },
  {
    eventCode: 'REC002',
    name: '文化祭準備',
    time: '1400',
    duration: '120',
    place: '第1教室',
    gatherTime: '1350',
    summary: '来月の文化祭に向けた展示物準備',
  },
  {
    eventCode: 'REC003',
    name: '英語スピーチコンテスト',
    time: '1630',
    duration: '90',
    place: '講堂',
    gatherTime: '1620',
    summary: '学年対抗英語プレゼンテーション大会',
  },
  {
    eventCode: 'REC004',
    name: 'プログラミング勉強会',
    time: '1900',
    duration: '120',
    place: 'PC教室',
    gatherTime: '1850',
    summary: 'React/TypeScript実践セッション',
  },
] as const;

export type SeededEvent = {
  eventId: number;
  eventCode: string;
  name: string;
  time: string;
  duration: string;
  place: string;
  gatherTime: string;
  summary: string | null;
};

export type SeededEventData = {
  events: SeededEvent[];
};

export async function seedEvents(db: D1Database): Promise<SeededEventData> {
  const orm = drizzle(db, { schema });

  // 外部キーの参照元から削除する。
  await orm.delete(notification_send_logs);
  await orm.delete(entries);
  await orm.delete(events);

  const seeded: SeededEvent[] = [];
  for (const e of EVENTS) {
    const [row] = await orm.insert(events).values(e).returning();
    seeded.push({
      eventId: row.id,
      eventCode: e.eventCode,
      name: e.name,
      time: e.time,
      duration: e.duration,
      place: e.place,
      gatherTime: e.gatherTime,
      summary: e.summary,
    });
  }

  return { events: seeded };
}
