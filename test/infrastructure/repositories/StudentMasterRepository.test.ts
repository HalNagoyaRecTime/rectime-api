import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createStudentMasterRepository } from '../../../src/infrastructure/repositories/StudentMasterRepository';

describe('StudentMasterRepository', () => {
  const repo = createStudentMasterRepository(env.DB);
  let createdIds: number[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) {
      return;
    }
    await env.DB.batch(
      createdIds.map(id =>
        env.DB.prepare(
          'DELETE FROM student_master WHERE student_master = ?'
        ).bind(id)
      )
    );
    createdIds = [];
  });

  describe('bulkCreate', () => {
    it('複数行をまとめて作成し、結合したエンティティを返す', async () => {
      const created = await repo.bulkCreate([
        {
          classCode: 11,
          attendanceNumber: 1,
          studentIdNumber: 90000,
          userName: '田中太郎',
        },
        {
          classCode: 11,
          attendanceNumber: 2,
          studentIdNumber: 90001,
          userName: '佐藤花子',
        },
      ]);
      createdIds.push(...created.map(row => row.student_master));

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({
        class_code: 11,
        attendance_number: 1,
        student_id_number: 90000,
        user_name: '田中太郎',
      });
      expect(created[1]).toMatchObject({
        class_code: 11,
        attendance_number: 2,
        student_id_number: 90001,
        user_name: '佐藤花子',
      });
    });

    it('学籍番号が重複する場合はエラーを投げる', async () => {
      const [first] = await repo.bulkCreate([
        {
          classCode: 12,
          attendanceNumber: 1,
          studentIdNumber: 90010,
          userName: '重複元',
        },
      ]);
      createdIds.push(first.student_master);

      await expect(
        repo.bulkCreate([
          {
            classCode: 12,
            attendanceNumber: 2,
            studentIdNumber: 90010,
            userName: '重複狙い',
          },
        ])
      ).rejects.toThrow();
    });

    it('class_code と attendance_number の組み合わせが重複する場合はエラーを投げる', async () => {
      const [first] = await repo.bulkCreate([
        {
          classCode: 13,
          attendanceNumber: 1,
          studentIdNumber: 90020,
          userName: '重複元2',
        },
      ]);
      createdIds.push(first.student_master);

      await expect(
        repo.bulkCreate([
          {
            classCode: 13,
            attendanceNumber: 1,
            studentIdNumber: 90021,
            userName: '重複狙い2',
          },
        ])
      ).rejects.toThrow();
    });

    it('空配列を渡した場合は何も作成しない', async () => {
      await expect(repo.bulkCreate([])).resolves.toEqual([]);
    });
  });

  describe('findAll', () => {
    it('作成した行が全件取得結果に含まれる', async () => {
      const [created] = await repo.bulkCreate([
        {
          classCode: 14,
          attendanceNumber: 1,
          studentIdNumber: 90030,
          userName: '一覧確認太郎',
        },
      ]);
      createdIds.push(created.student_master);

      const all = await repo.findAll();

      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            student_master: created.student_master,
            class_code: 14,
            attendance_number: 1,
            student_id_number: 90030,
            user_name: '一覧確認太郎',
          }),
        ])
      );
    });
  });
});
