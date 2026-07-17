import { createRoute } from '@hono/zod-openapi';
import {
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  positivePathParam,
  badRequestResponse,
  z,
} from './schemas';

export const studentResponseSchema = z
  .object({
    student_id: z.number().int(),
    display_name: z.string(),
    class_room_id: z.number().int(),
    attendance_number: z.number().int(),
    student_id_number: z.string(),
  })
  .openapi('Student');

export type StudentResponseDTO = z.infer<typeof studentResponseSchema>;

export const studentListResponseSchema = z
  .array(studentResponseSchema)
  .openapi('StudentList');

export type StudentListResponseDTO = z.infer<typeof studentListResponseSchema>;

export const classRoomResponseSchema = z
  .object({
    class_room_id: z.number().int(),
    class_code: z.string(),
    name: z.string(),
  })
  .openapi('ClassRoom');

export type ClassRoomResponseDTO = z.infer<typeof classRoomResponseSchema>;

export const classRoomListResponseSchema = z
  .array(classRoomResponseSchema)
  .openapi('ClassRoomList');

export type ClassRoomListResponseDTO = z.infer<
  typeof classRoomListResponseSchema
>;

export const studentIdParams = z.object({
  studentId: positivePathParam('studentId', '学生ID'),
});

export const studentListRoute = createRoute({
  method: 'get',
  path: '/students',
  tags: ['Students'],
  summary: '学生一覧を取得する',
  responses: {
    200: jsonResponse(studentListResponseSchema, '学生一覧'),
    500: internalServerErrorResponse,
  },
});

export const studentDetailRoute = createRoute({
  method: 'get',
  path: '/students/{studentId}',
  tags: ['Students'],
  summary: '学生を取得する',
  request: { params: studentIdParams },
  responses: {
    200: jsonResponse(studentResponseSchema, '学生'),
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const classListRoute = createRoute({
  method: 'get',
  path: '/classes',
  tags: ['Classes'],
  summary: 'クラス一覧を取得する',
  responses: {
    200: jsonResponse(classRoomListResponseSchema, 'クラス一覧'),
    500: internalServerErrorResponse,
  },
});
