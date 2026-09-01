import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const staffResponseSchema = z
  .object({
    staff_id: z.number().int(),
    user_id: z.number().int(),
    display_name: z.string(),
  })
  .openapi('Staff');

export type StaffResponseDTO = z.infer<typeof staffResponseSchema>;

export const staffListResponseSchema = z
  .array(staffResponseSchema)
  .openapi('StaffList');

export type StaffListResponseDTO = z.infer<typeof staffListResponseSchema>;

export const staffIdParams = z.object({
  staffId: positivePathParam('staffId', '職員ID'),
});

export const staffListRoute = createRoute({
  method: 'get',
  path: '/staffs',
  tags: ['Staffs'],
  summary: '職員一覧を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(staffListResponseSchema, '職員一覧'),
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});

export const staffDetailRoute = createRoute({
  method: 'get',
  path: '/staffs/{staffId}',
  tags: ['Staffs'],
  summary: '職員を取得する',
  security: bearerAuth,
  request: { params: staffIdParams },
  responses: {
    200: jsonResponse(staffResponseSchema, '職員'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
