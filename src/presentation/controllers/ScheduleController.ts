import { Context } from 'hono';
import { IScheduleService } from '../../application/services/IScheduleService';
import { ScheduleNotFoundError } from '../../domain/errors/ScheduleNotFoundError';

export function createScheduleController(scheduleService: IScheduleService) {
  const getAllSchedules = async (c: Context) => {
    try {
      const schedules = await scheduleService.getAllSchedules();
      return c.json({ schedules, total: schedules.length });
    } catch (error) {
      console.error('Error fetching schedules:', error);
      // すべてのエラーレスポンスで { error, code } 形式を統一する
      return c.json(
        { error: 'Failed to fetch schedules', code: 'INTERNAL_ERROR' },
        500
      );
    }
  };

  const getScheduleById = async (c: Context) => {
    try {
      const scheduleIdParam = c.req.param('scheduleId');

      // f_schedule_id は正の整数。"1.5"・-3・0・"1e9"・先頭ゼロ などを弾くため、
      // Number 変換前に正の整数の文字列形式かを検証する。
      if (!scheduleIdParam || !/^[1-9][0-9]*$/.test(scheduleIdParam)) {
        return c.json(
          { error: 'Invalid schedule ID', code: 'INVALID_SCHEDULE_ID' },
          400
        );
      }

      const id = Number(scheduleIdParam);

      const schedule = await scheduleService.getScheduleById(id);
      return c.json(schedule);
    } catch (error) {
      // メッセージ文字列ではなく専用エラークラスで判定する（404 の意図を明確化）
      if (error instanceof ScheduleNotFoundError) {
        return c.json(
          { error: 'Schedule not found', code: 'SCHEDULE_NOT_FOUND' },
          404
        );
      }
      console.error('Error fetching schedule:', error);
      return c.json(
        { error: 'Failed to fetch schedule', code: 'INTERNAL_ERROR' },
        500
      );
    }
  };

  return {
    getAllSchedules,
    getScheduleById,
  };
}
