import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
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
const classRoomIdsSchema = z
  .array(z.number().int().positive())
  .openapi({
    description: '正の整数。重複した値を含められない。',
    uniqueItems: true,
  })
  .refine(ids => new Set(ids).size === ids.length, {
    message: 'classRoomIds must not contain duplicate values',
  });

export const teacherListQuery = z
  .object({
    search: z.string().trim().min(1).optional(),
    classRoomId: digitsOnlyQuery(1).optional(),
    isStaff: z.enum(['true', 'false', 'all']).default('all'),
    isLiveActive: z.enum(['true', 'false', 'all']).default('true'),
    sortBy: z
      .enum([
        'teacherId',
        'displayName',
        'classCode',
        'className',
        'isStaff',
        'isLiveActive',
      ])
      .default('teacherId'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    offset: digitsOnlyQuery(0).default(0),
    limit: limitedDigitsOnlyQuery(1, 100).default(50),
  })
  .strict();

export const teacherCreateSchema = z
  .object({
    userName: z.string().trim().min(1),
    classRoomIds: classRoomIdsSchema,
  })
  .strict()
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
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const teacherUpdateSchema = z
  .object({
    userName: z.string().trim().min(1),
    classRoomIds: classRoomIdsSchema,
  })
  .strict()
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
