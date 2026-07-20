import { Context } from 'hono';
import { z } from 'zod';
import { IStudentMasterService } from '../../application/services/IStudentMasterService';
import { StudentMasterDuplicateError } from '../../domain/errors/StudentMasterDuplicateError';

const importRowSchema = z.object({
  class_code: z.number().int(),
  attendance_number: z.number().int(),
  student_id_number: z.number().int(),
  user_name: z.string().min(1),
});

const importStudentMasterSchema = z.object({
  rows: z.array(importRowSchema).min(1),
});

export function createStudentMasterController(
  studentMasterService: IStudentMasterService
) {
  const importStudentMaster = async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => undefined);
      const parsedBody = importStudentMasterSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid student master import request body',
            details: parsedBody.error.flatten(),
          },
          400
        );
      }

      const result = await studentMasterService.importStudentMaster(
        parsedBody.data
      );
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof StudentMasterDuplicateError) {
        return c.json(
          {
            error: 'Duplicate student master data',
            duplicates: error.duplicates.map(duplicate => ({
              row_index: duplicate.rowIndex,
              class_code: duplicate.classCode,
              attendance_number: duplicate.attendanceNumber,
              student_id_number: duplicate.studentIdNumber,
              user_name: duplicate.userName,
              reasons: duplicate.reasons,
            })),
          },
          409
        );
      }
      return c.json({ error: 'Failed to import student master data' }, 500);
    }
  };

  return {
    importStudentMaster,
  };
}
