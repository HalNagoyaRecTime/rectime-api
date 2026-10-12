import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0040_add_gatherings_round_start_time.sql', () => {
  it('開始時刻は任意で、旧形式の集合予定も作成できる', async () => {
    const event = await env.DB.prepare("INSERT INTO events (event_name,start_time,end_time) VALUES ('0040確認','1000','1200') RETURNING event_id").first<{event_id:number}>();
    const spot = await env.DB.prepare("INSERT INTO gathering_spots (gathering_spot_name) VALUES ('0040場所') RETURNING gathering_spot_id").first<{gathering_spot_id:number}>();
    try {
      const row = await env.DB.prepare('INSERT INTO gatherings (event_id,gathering_spot_id,round,gathering_time) VALUES (?,?,1,?) RETURNING gathering_id,round_start_time')
        .bind(event!.event_id,spot!.gathering_spot_id,'09:45').first<{gathering_id:number;round_start_time:string|null}>();
      expect(row!.round_start_time).toBeNull();
      await env.DB.prepare('UPDATE gatherings SET round_start_time = ? WHERE gathering_id = ?').bind('2359',row!.gathering_id).run();
      for (const invalid of ['2400','99:59','100','abcd']) {
        await expect(env.DB.prepare('UPDATE gatherings SET round_start_time = ? WHERE gathering_id = ?').bind(invalid,row!.gathering_id).run()).rejects.toThrow();
      }
      expect(await env.DB.prepare('SELECT round,gathering_time,round_start_time FROM gatherings WHERE gathering_id = ?').bind(row!.gathering_id).first())
        .toEqual({round:1,gathering_time:'09:45',round_start_time:'2359'});
    } finally {
      await env.DB.prepare('DELETE FROM gatherings WHERE event_id = ?').bind(event!.event_id).run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?').bind(event!.event_id).run();
      await env.DB.prepare('DELETE FROM gathering_spots WHERE gathering_spot_id = ?').bind(spot!.gathering_spot_id).run();
    }
  });
});
