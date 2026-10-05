import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  internalServerErrorResponse,
  jsonResponse,
  positivePathParam,
  z,
} from '../schemas';
import {
  notificationBadRequestResponse,
  notificationPushDeliveryNotFoundResponse,
  notificationStaffForbiddenResponse,
  notificationUnauthorizedResponse,
} from './errors';
import { notificationPushDeliveryDetailSchema } from './commonSchemas';

export const notificationPushDeliveryIdParams = z.object({
  notificationPushDeliveryId: positivePathParam(
    'notificationPushDeliveryId',
    'Push配信ID'
  ),
});

export const notificationPushDeliveryDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/push-deliveries/{notificationPushDeliveryId}',
  tags: ['Push deliveries'],
  summary: 'Push配信詳細を取得する',
  security: bearerAuth,
  request: { params: notificationPushDeliveryIdParams },
  responses: {
    200: jsonResponse(notificationPushDeliveryDetailSchema, 'Push配信詳細'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationPushDeliveryNotFoundResponse,
    500: internalServerErrorResponse,
  },
});
