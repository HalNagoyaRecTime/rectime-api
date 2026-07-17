import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { createDIContainer } from './di/container';
import type { Env } from './lib/env';
import {
  classListRoute,
  studentDetailRoute,
  studentListRoute,
} from './presentation/openapi/students';
import {
  eventDetailRoute,
  eventListRoute,
} from './presentation/openapi/events';
import {
  gatheringCreateRoute,
  gatheringGroupCreateRoute,
  gatheringGroupListRoute,
  gatheringGroupMemberCreateRoute,
  gatheringGroupMemberDeleteRoute,
  gatheringGroupMemberListRoute,
  gatheringListRoute,
  gatheringSpotCreateRoute,
  gatheringSpotListRoute,
} from './presentation/openapi/gatherings';
import {
  firebaseTokenCreateRoute,
  notificationScheduleCreateRoute,
  notificationScheduleListRoute,
  runScheduledNotificationsRoute,
  runScheduledNotificationsSchema,
  testNotificationRoute,
} from './presentation/openapi/notifications';
import { jsonResponse, z } from './presentation/openapi/schemas';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from './presentation/middleware/diContainer';

const app = new OpenAPIHono<{ Bindings: Env }>();

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'ヘルスチェック',
  responses: {
    200: jsonResponse(z.object({ status: z.literal('ok') }), '正常'),
  },
});

const rootRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['System'],
  summary: 'APIの概要を取得する',
  responses: {
    200: jsonResponse(
      z.object({
        message: z.string(),
        version: z.string(),
        endpoints: z.record(z.string()),
        openapi: z.string(),
        docs: z.string(),
      }),
      'APIの概要'
    ),
  },
});

let corsWarnLogged = false;
let tenantWarnLogged = false;

app.use('*', (c, next) => {
  const origins = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (origins.length === 0 && !corsWarnLogged) {
    console.warn(
      '[CORS] ALLOWED_ORIGINS is not set — all cross-origin requests will be blocked'
    );
    corsWarnLogged = true;
  }
  return cors({
    origin: origin => (origins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 600,
  })(c, next);
});

app.use('*', (c, next) => {
  const tenant = (c.env.MICROSOFT_TENANT ?? '').trim();
  const tenantAllowsAny =
    tenant === '' || tenant === 'common' || tenant === 'organizations';
  const allowedTenants = (c.env.ALLOWED_MICROSOFT_TENANTS ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  if (tenantAllowsAny && allowedTenants.length === 0 && !tenantWarnLogged) {
    console.warn(
      '[AUTH] MICROSOFT_TENANT is "' +
        tenant +
        '" but ALLOWED_MICROSOFT_TENANTS is not set — all auth requests will be rejected with INVALID_ID_TOKEN'
    );
    tenantWarnLogged = true;
  }
  return next();
});

app.openapi(healthRoute, c => c.json({ status: 'ok' }, 200));

app.openapi(rootRoute, c => {
  return c.json(
    {
      message: 'rectime_be',
      version: '1.0.0',
      endpoints: {
        students: '/api/v1/students/{studentId}',
        events: '/api/v1/events',
        classes: '/api/v1/classes',
        gatheringSpots: '/api/v1/gathering-spots',
        gatheringGroups: '/api/v1/gathering-groups',
        gatherings: '/api/v1/gatherings',
        firebaseTokens: '/api/v1/firebase-tokens',
        testNotification: '/api/v1/notifications/test',
        notificationSchedules: '/api/v1/notification-schedules',
        runScheduledNotifications: '/api/v1/notifications/schedule/run',
      },
      openapi: '/openapi.json',
      docs: '/docs',
    },
    200
  );
});

// API v1 routes
const apiV1 = new OpenAPIHono<{
  Bindings: Env;
  Variables: ContainerVariables;
}>();

apiV1.use('*', diContainerMiddleware);

// Student routes
apiV1.openapi(studentListRoute, c =>
  c.get('container').studentController.getAllStudent(c)
);
apiV1.openapi(studentDetailRoute, c =>
  c.get('container').studentController.getStudentById(c)
);

// Event routes
apiV1.openapi(eventListRoute, c =>
  c.get('container').eventController.getAllEvents(c)
);
apiV1.openapi(eventDetailRoute, c =>
  c.get('container').eventController.getEventById(c)
);

// Class routes
apiV1.openapi(classListRoute, c =>
  c.get('container').classController.getAllClasses(c)
);

// Gathering spot routes
apiV1.openapi(gatheringSpotListRoute, c =>
  c.get('container').gatheringSpotController.getAllGatheringSpots(c)
);
apiV1.openapi(gatheringSpotCreateRoute, c =>
  c.get('container').gatheringSpotController.createGatheringSpot(c)
);

// Gathering group routes
apiV1.openapi(gatheringGroupListRoute, c =>
  c.get('container').gatheringGroupController.getAllGatheringGroups(c)
);
apiV1.openapi(gatheringGroupCreateRoute, c =>
  c.get('container').gatheringGroupController.createGatheringGroup(c)
);
apiV1.openapi(gatheringGroupMemberListRoute, c =>
  c.get('container').gatheringGroupMemberController.getGatheringGroupMembers(c)
);
apiV1.openapi(gatheringGroupMemberCreateRoute, c =>
  c.get('container').gatheringGroupMemberController.addGatheringGroupMember(c)
);
apiV1.openapi(gatheringGroupMemberDeleteRoute, c =>
  c
    .get('container')
    .gatheringGroupMemberController.removeGatheringGroupMember(c)
);

// Gathering routes
apiV1.openapi(gatheringListRoute, c =>
  c.get('container').gatheringController.getAllGatherings(c)
);
apiV1.openapi(gatheringCreateRoute, c =>
  c.get('container').gatheringController.createGathering(c)
);

// Firebase token routes
apiV1.openapi(firebaseTokenCreateRoute, c =>
  c.get('container').firebaseTokenController.registerFirebaseToken(c)
);

// Notification routes
apiV1.openapi(notificationScheduleListRoute, c =>
  c
    .get('container')
    .notificationScheduleController.getAllNotificationSchedules(c)
);
apiV1.openapi(notificationScheduleCreateRoute, c =>
  c
    .get('container')
    .notificationScheduleController.createNotificationSchedule(c)
);

apiV1.openapi(testNotificationRoute, c =>
  c.get('container').notificationController.sendTestNotification(c)
);

apiV1.openapi(runScheduledNotificationsRoute, async c => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsedBody = runScheduledNotificationsSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json({ error: 'Invalid now value' }, 400);
    }
    const now = parsedBody.data.now
      ? new Date(parsedBody.data.now)
      : new Date();

    const result = await c
      .get('container')
      .scheduledNotificationService.sendScheduledEventNotifications(now);
    return c.json(result, 200);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to run scheduled notifications',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Mount API v1
app.route('/api/v1', apiV1);

app.doc('/openapi.json', {
  openapi: '3.0.3',
  info: { title: 'RecTime API', version: '1.0.0' },
});
app.get(
  '/docs',
  swaggerUI({ url: '/openapi.json', title: 'RecTime API Docs' })
);

export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const container = createDIContainer(env);
    ctx.waitUntil(
      container.scheduledNotificationService.sendScheduledEventNotifications()
    );
  },
};
