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
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const teacherClassRoomSchema = z
  .object({
    class_room_id: z.number().int(),
    class_code: z.string(),
    class_name: z.string(),
  })
  .openapi('TeacherClassRoom');

export const teacherResponseSchema = z
  .object({
    teacher_id: z.number().int(),
    user_id: z.number().int(),
    display_name: z.string(),
    is_live_active: z.boolean(),
    is_staff: z.boolean(),
    class_rooms: z.array(teacherClassRoomSchema),
  })
  .openapi('Teacher');

export type TeacherResponseDTO = z.infer<typeof teacherResponseSchema>;

export const teacherPageResponseSchema = z
  .object({
    items: z.array(teacherResponseSchema),
    ...paginationFields,
  })
  .openapi('TeacherPage');

export type TeacherPageResponseDTO = z.infer<typeof teacherPageResponseSchema>;

export const teacherIdParams = z.object({
  teacherId: positivePathParam('teacherId', '教員ID'),
});

export const teacherListQuery = z.object({
  search: z.string().trim().min(1).optional(),
  classRoomId: z.coerce.number().int().positive().optional(),
  isStaff: z.enum(['true', 'false', 'all']).default('all').optional(),
  isLiveActive: z.enum(['true', 'false', 'all']).default('all').optional(),
  sortBy: z
    .enum(['teacherId', 'displayName', 'classCode', 'className'])
    .default('teacherId')
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc').optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

export const teacherCreateSchema = z
  .object({
    userName: z.string().trim().min(1),
    classRoomIds: z.array(z.number().int().positive()),
  })
  .openapi('TeacherCreateRequest');

export const teacherCreateRoute = createRoute({
  method: 'post',
  path: '/teachers',
  tags: ['Teachers'],
  summary: '教員を登録する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: teacherCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(teacherResponseSchema, '登録した教員'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const teacherUpdateSchema = z
  .object({
    userName: z.string().min(1),
    classRoomIds: z.array(z.number().int().positive()).openapi({
      description: '重複した値を含められない。',
    }),
  })
  .openapi('TeacherUpdateRequest');

export const teacherListRoute = createRoute({
  method: 'get',
  path: '/teachers',
  tags: ['Teachers'],
  summary: '教員一覧を取得する',
  security: bearerAuth,
  request: { query: teacherListQuery },
  responses: {
    200: jsonResponse(teacherPageResponseSchema, '教員一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const teacherDetailRoute = createRoute({
  method: 'get',
  path: '/teachers/{teacherId}',
  tags: ['Teachers'],
  summary: '教員を取得する',
  security: bearerAuth,
  request: { params: teacherIdParams },
  responses: {
    200: jsonResponse(teacherResponseSchema, '教員'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const teacherUpdateRoute = createRoute({
  method: 'put',
  path: '/teachers/{teacherId}',
  tags: ['Teachers'],
  summary: '教員を更新する',
  security: bearerAuth,
  request: {
    params: teacherIdParams,
    body: {
      content: { 'application/json': { schema: teacherUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(teacherResponseSchema, '更新した教員'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const teacherDeleteRoute = createRoute({
  method: 'delete',
  path: '/teachers/{teacherId}',
  tags: ['Teachers'],
  summary: '教員を削除する',
  security: bearerAuth,
  request: { params: teacherIdParams },
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
