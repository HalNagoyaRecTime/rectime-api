import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
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

    async createMany(inputs: NewTeacherInput[]): Promise<TeacherEntity[]> {
      if (inputs.length === 0) {
        return [];
      }

      const statements: D1PreparedStatement[] = [];
      for (const input of inputs) {
        statements.push(
          db
            .prepare(
              `INSERT INTO users (user_name, updated_at)
               VALUES (?, CURRENT_TIMESTAMP)
               RETURNING user_id, user_name`
            )
            .bind(input.displayName)
        );
        statements.push(
          db.prepare(
            `INSERT INTO teachers (user_id, updated_at)
             VALUES (last_insert_rowid(), CURRENT_TIMESTAMP)
             RETURNING teacher_id, user_id`
          )
        );
      }

      const results = await db.batch<ReturnedUserRow | ReturnedTeacherRow>(
        statements
      );

      const created: TeacherEntity[] = [];
      for (let i = 0; i < inputs.length; i++) {
        const user = results[i * 2].results[0] as ReturnedUserRow | undefined;
        const teacher = results[i * 2 + 1].results[0] as
          | ReturnedTeacherRow
          | undefined;
        if (!user || !teacher) {
          throw new Error('Failed to create teacher');
        }
        created.push({
          teacher_id: teacher.teacher_id,
          user_id: user.user_id,
          user_name: user.user_name,
        });
      }

      return created;
    },
  };
}
