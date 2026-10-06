import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  digitsOnlyQuery,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  limitedDigitsOnlyQuery,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const studentResponseSchema = z
  .object({
    student_id: z.number().int(),
    user_id: z.number().int(),
    display_name: z.string(),
    attendance_number: z.number().int().nullable(),
    student_id_number: z.string(),
    is_live_active: z.boolean(),
    is_staff: z.boolean(),
    class_room: z
      .object({
        class_room_id: z.number().int(),
        class_code: z.string(),
        class_name: z.string(),
      })
      .nullable(),
  })
  .openapi('Student');

export type StudentResponseDTO = z.infer<typeof studentResponseSchema>;

export const studentPageResponseSchema = z
  .object({
    items: z.array(studentResponseSchema),
    ...paginationFields,
  })
  .openapi('StudentPage');

export type StudentPageResponseDTO = z.infer<typeof studentPageResponseSchema>;

export const studentIdParams = z.object({
  studentId: positivePathParam('studentId', '学生ID'),
});

export const studentListQuery = z
  .object({
    search: z.string().trim().min(1).optional(),
    classRoomId: digitsOnlyQuery(1).optional(),
    isStaff: z.enum(['true', 'false', 'all']).default('all'),
    isLiveActive: z.enum(['true', 'false', 'all']).default('true'),
    sortBy: z
      .enum([
        'studentId',
        'studentIdNumber',
        'displayName',
        'classCode',
        'className',
        'attendanceNumber',
        'isStaff',
        'isLiveActive',
      ])
      .default('studentId'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    offset: digitsOnlyQuery(0).default(0),
    limit: limitedDigitsOnlyQuery(1, 100).default(50),
  })
  .strict()
  .transform(({ isStaff, isLiveActive, ...query }) => ({
    ...query,
    ...(isStaff === 'all' ? {} : { isStaff: isStaff === 'true' }),
    ...(isLiveActive === 'all'
      ? {}
      : { isLiveActive: isLiveActive === 'true' }),
  }));

export const studentWriteSchema = z
  .object({
    display_name: z.string().trim().min(1).max(100),
    class_room_id: z.number().int().positive().nullable(),
    attendance_number: z.number().int().positive().nullable(),
    student_id_number: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine(
    value =>
      (value.class_room_id === null) === (value.attendance_number === null),
    {
      message:
        'class_room_id and attendance_number must both be null or both have values',
    }
  )
  .openapi('StudentWriteRequest');

export const studentClassRoomAssignmentSchema = z
  .union([
    z
      .object({
        class_room_id: z.number().int().positive(),
        attendance_number: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        class_room_id: z.null(),
        attendance_number: z.null(),
      })
      .strict(),
  ])
  .openapi('StudentClassRoomAssignmentRequest', {
    description:
      'class_room_idとattendance_numberは両方に値を指定するか、両方をnullにする。',
  });

export const studentListRoute = createRoute({
  method: 'get',
  path: '/students',
  tags: ['Students'],
  summary: '学生一覧を取得する',
  security: bearerAuth,
  request: { query: studentListQuery },
  responses: {
    200: jsonResponse(studentPageResponseSchema, '学生一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const studentDetailRoute = createRoute({
  method: 'get',
  path: '/students/{studentId}',
  tags: ['Students'],
  summary: '学生を取得する',
  security: bearerAuth,
  request: { params: studentIdParams },
  responses: {
    200: jsonResponse(studentResponseSchema, '学生'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const studentCreateRoute = createRoute({
  method: 'post',
  path: '/students',
  tags: ['Students'],
  summary: '学生を登録する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: studentWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(studentResponseSchema, '登録した学生'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const studentUpdateRoute = createRoute({
  method: 'put',
  path: '/students/{studentId}',
  tags: ['Students'],
  summary: '学生を更新する',
  security: bearerAuth,
  request: {
    params: studentIdParams,
    body: {
      content: { 'application/json': { schema: studentWriteSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(studentResponseSchema, '更新した学生'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const studentClassRoomUpdateRoute = createRoute({
  method: 'patch',
  path: '/students/{studentId}/classroom',
  tags: ['Students'],
  summary: '学生のクラス所属を変更する',
  security: bearerAuth,
  request: {
    params: studentIdParams,
    body: {
      content: {
        'application/json': { schema: studentClassRoomAssignmentSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(studentResponseSchema, '所属変更後の学生'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
