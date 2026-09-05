import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  paginationQuery,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const classRoomTeacherSchema = z
  .object({
    teacher_id: z.number().int(),
    user_id: z.number().int(),
    display_name: z.string(),
  })
  .openapi('ClassRoomTeacher');

export const classRoomResponseSchema = z
  .object({
    class_room_id: z.number().int(),
    class_code: z.string(),
    class_name: z.string(),
    student_count: z.number().int(),
    teacher: classRoomTeacherSchema.nullable(),
    team_id: z.number().int(),
  })
  .openapi('ClassRoom');

export type ClassRoomResponseDTO = z.infer<typeof classRoomResponseSchema>;

export const classRoomPageResponseSchema = z
  .object({
    classrooms: z.array(classRoomResponseSchema),
    ...paginationFields,
  })
  .openapi('ClassRoomPage');

export type ClassRoomPageResponseDTO = z.infer<
  typeof classRoomPageResponseSchema
>;

export const classIdParams = z.object({
  classId: positivePathParam('classId', '教室ID'),
});

export const classRoomListQuery = paginationQuery(100, 20);

export const classRoomWriteSchema = z
  .object({
    classCode: z.string().trim().min(1),
    className: z.string().trim().min(1),
    teacherId: z.number().int().positive().nullable(),
    teamId: z.number().int().positive().optional(),
  })
  .openapi('ClassRoomWriteRequest');

export const classRoomListRoute = createRoute({
  method: 'get',
  path: '/classrooms',
  tags: ['Classrooms'],
  summary: '教室一覧を取得する',
  security: bearerAuth,
  request: { query: classRoomListQuery },
  responses: {
    200: jsonResponse(classRoomPageResponseSchema, '教室一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const classRoomDetailRoute = createRoute({
  method: 'get',
  path: '/classrooms/{classId}',
  tags: ['Classrooms'],
  summary: '教室を取得する',
  security: bearerAuth,
  request: { params: classIdParams },
  responses: {
    200: jsonResponse(classRoomResponseSchema, '教室'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const classRoomCreateRoute = createRoute({
  method: 'post',
  path: '/classrooms',
  tags: ['Classrooms'],
  summary: '教室を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: classRoomWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(classRoomResponseSchema, '作成した教室'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const classRoomUpdateRoute = createRoute({
  method: 'put',
  path: '/classrooms/{classId}',
  tags: ['Classrooms'],
  summary: '教室を更新する',
  security: bearerAuth,
  request: {
    params: classIdParams,
    body: {
      content: { 'application/json': { schema: classRoomWriteSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(classRoomResponseSchema, '更新した教室'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const classRoomDeleteRoute = createRoute({
  method: 'delete',
  path: '/classrooms/{classId}',
  tags: ['Classrooms'],
  summary: '教室を削除する',
  security: bearerAuth,
  request: { params: classIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
