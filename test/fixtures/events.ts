import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import { events } from '../../src/infrastructure/database/schema';

const EVENTS = [
  {
    userId: -1,
    name: 'バスケットボール大会',
    ruleText: '3on3',
    venue: '体育館',
    startTime: '1100',
    endTime: '1300',
  },
  {
    userId: -1,
    name: '文化祭準備',
    ruleText: '展示準備',
    venue: '第1教室',
    startTime: '1400',
    endTime: '1600',
  },
  {
    userId: -1,
    name: '英語スピーチコンテスト',
    ruleText: null,
    venue: '講堂',
    startTime: '1630',
    endTime: '1800',
  },
] as const;

export type SeededEvent = {
  eventId: number;
  name: string;
  startTime: string;
  endTime: string;
  venue: string;
};
export type SeededEventData = { events: SeededEvent[] };

export async function seedEvents(db: D1Database): Promise<SeededEventData> {
  const orm = drizzle(db, { schema });
  await orm.delete(events);
  const seeded: SeededEvent[] = [];
  for (const event of EVENTS) {
    const row = await orm.insert(events).values(event).returning().get();
    if (!row) throw new Error('failed to seed event');
    seeded.push({
      eventId: row.id,
      name: row.name,
      startTime: row.startTime,
      endTime: row.endTime,
      venue: row.venue,
    });
  }
  return { events: seeded };
}
