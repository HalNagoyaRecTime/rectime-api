import { D1Database } from '@cloudflare/workers-types';
import { TeacherEntity } from '../../domain/entities/Teacher';
import {
  ITeacherRepository,
  NewTeacherInput,
} from '../../domain/interfaces/repositories/ITeacherRepository';

type ReturnedUserRow = {
  user_id: number;
  user_name: string;
};

type ReturnedTeacherRow = {
  teacher_id: number;
  user_id: number;
};

export function createTeacherRepository(db: D1Database): ITeacherRepository {
  return {
    async create(input: NewTeacherInput): Promise<TeacherEntity> {
      const [userResult, teacherResult] = await db.batch<
        ReturnedUserRow | ReturnedTeacherRow
      >([
        db
          .prepare(
            `INSERT INTO users (user_name, updated_at)
             VALUES (?, CURRENT_TIMESTAMP)
             RETURNING user_id, user_name`
          )
          .bind(input.displayName),
        db.prepare(
          `INSERT INTO teachers (user_id, updated_at)
           VALUES (last_insert_rowid(), CURRENT_TIMESTAMP)
           RETURNING teacher_id, user_id`
        ),
      ]);

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const created = teacherResult.results[0] as
        | ReturnedTeacherRow
        | undefined;
      if (!user || !created) {
        throw new Error('Failed to create teacher');
      }

      return {
        teacher_id: created.teacher_id,
        user_id: user.user_id,
        user_name: user.user_name,
      };
    },
  };
}
