import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono, type RouteConfig } from '@hono/zod-openapi';
import { authRouter } from './presentation/auth/router';
import { createDIContainer } from './di/container';
export { MasterImportCommitLock } from './infrastructure/masterImports/MasterImportCommitLock';
import { isDocsEnabled, type Env } from './lib/env';
import { isEventDate, isValidEventDate } from './lib/eventDate';
import type { NotificationDeliveryMessage } from './domain/entities/NotificationDelivery';
import { consumeNotificationDeliveryQueue } from './infrastructure/queues/NotificationDeliveryQueueConsumer';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from './presentation/middleware/diContainer';
import {
  requireAuth,
  type AuthVariables,
} from './presentation/middleware/requireAuth';
import { requireStaff } from './presentation/middleware/requireStaff';
import {
  bearerAuthenticationMiddleware,
  type AuthenticationVariables,
} from './presentation/middleware/bearerAuthentication';
import { validationDefaultHook } from './presentation/openapi/schemas';
import { apiOverviewRoute, healthRoute } from './presentation/openapi/system';
import {
  studentCreateRoute,
  studentDetailRoute,
  studentListRoute,
  studentUpdateRoute,
} from './presentation/openapi/students';
import {
  staffDetailRoute,
  staffListRoute,
} from './presentation/openapi/staffs';
import {
  teacherDeleteRoute,
  teacherDetailRoute,
  teacherListRoute,
  teacherUpdateRoute,
} from './presentation/openapi/teachers';
import {
  eventCreateRoute,
  eventDeleteRoute,
  eventDetailRoute,
  eventGatheringListRoute,
  eventListRoute,
  eventNotificationSummaryRoute,
  eventPatchRoute,
  eventScheduleUpdateRoute,
  eventUpdateRoute,
} from './presentation/openapi/events';
import {
  classRoomCreateRoute,
  classRoomDeleteRoute,
  classRoomDetailRoute,
  classRoomListRoute,
  classRoomUpdateRoute,
} from './presentation/openapi/classrooms';
import {
  masterImportCommitRoute,
  masterImportCreateRoute,
  masterImportDetailRoute,
} from './presentation/openapi/masterImports';
import {
  gatheringCreateRoute,
  gatheringDeleteRoute,
  gatheringListRoute,
  gatheringMemberCreateRoute,
  gatheringMemberDeleteRoute,
  gatheringMemberListRoute,
  gatheringSpotCreateRoute,
  gatheringSpotListRoute,
  gatheringSpotUpdateRoute,
} from './presentation/openapi/gatherings';
import {
  adminNotificationCreateRoute,
  adminNotificationDeleteRoute,
  adminNotificationDetailRoute,
  adminNotificationListRoute,
  adminNotificationUpdateRoute,
  firebaseTokenCreateRoute,
  myNotificationDetailRoute,
  myNotificationListRoute,
  notificationCreateRoute,
  notificationDetailRoute,
  notificationListRoute,
  notificationScheduleCreateRoute,
  notificationScheduleDeleteRoute,
  notificationScheduleDetailRoute,
  notificationScheduleListRoute,
  notificationUpdateRoute,
  scheduleUpdateRoute,
  testNotificationRoute,
} from './presentation/openapi/notifications';

const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: validationDefaultHook,
});

let corsWarnLogged = false;
const allowedOriginRulesCache = new Map<string, AllowedOriginRule[]>();
let tenantWarnLogged = false;
let eventDateWarnLogged = false;

app.use('*', (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS ?? '';
  const allowedOriginRules = getAllowedOriginRules(allowedOrigins);
  if (allowedOriginRules.length === 0 && !corsWarnLogged) {
    console.warn(
      '[CORS] ALLOWED_ORIGINS is not set — all cross-origin requests will be blocked'
    );
    corsWarnLogged = true;
  }
  return cors({
    origin: origin =>
      isAllowedOrigin(origin, allowedOriginRules) ? origin : null,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Client-Type',
      'X-PKCE-Code-Challenge',
      'X-State',
    ],
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

app.openapi(healthRoute, c => c.json({ status: 'ok' } as const, 200));

app.openapi(apiOverviewRoute, c => {
  return c.json(
    {
      message: 'rectime_be',
      version: '1.0.0',
      endpoints: {
        students: '/api/v1/students/{studentId}',
        staffs: '/api/v1/staffs/{staffId}',
        teachers: '/api/v1/teachers/{teacherId}',
        events: '/api/v1/events',
        classRooms: '/api/v1/classrooms',
        gatheringSpots: '/api/v1/gathering-spots',
        gatherings: '/api/v1/gatherings',
        gatheringMembers: '/api/v1/gatherings/{gatheringId}/members',
        schedules: '/api/v1/notification/schedules',
        firebaseTokens: '/api/v1/firebase-tokens',
        notifications: '/api/v1/notifications',
        adminNotifications: '/api/v1/admin/notifications',
        myNotifications: '/api/v1/me/notifications',
        testNotification: '/api/v1/notifications/test',
        notificationSchedules: '/api/v1/notification-schedules',
        myEvents: '/api/v1/me/events',
      },
      // 非公開の環境で存在しないエンドポイントを案内しないよう、
      // DOCS_ENABLED が有効なときだけ含める。
      ...(isDocsEnabled(c.env)
        ? { openapi: '/openapi.json', docs: '/docs' }
        : {}),
    },
    200
  );
});

// API v1 routes
const apiV1 = new OpenAPIHono<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>({ defaultHook: validationDefaultHook });

apiV1.use('*', diContainerMiddleware);
apiV1.use('*', bearerAuthenticationMiddleware);

/**
 * apiV1.use('*', requireAuth) にはしていない: /auth ルート（ログイン自体）まで
 * ブロックしてしまわないよう、認証が必要なルートにのみ個別に付与する。
 * OpenAPIHono ではミドルウェアをルート定義側で受け取るため、ここで包む。
 */
const authed = <R extends RouteConfig>(route: R) => ({
  ...route,
  middleware: requireAuth,
});

/**
 * requireAuthに加えてrequireStaffも要求する、管理系ルート向けのラッパー。
 * staff権限の判定は requireStaff がリクエストごとにDBから行う。
 */
const staffOnly = <R extends RouteConfig>(route: R) => ({
  ...route,
  middleware: [requireAuth, requireStaff],
});

// Student routes
apiV1.openapi(staffOnly(studentListRoute), c => {
  return c.get('container').studentController.getAllStudent(c);
});
apiV1.openapi(staffOnly(studentDetailRoute), c => {
  return c.get('container').studentController.getStudentById(c);
});
apiV1.openapi(staffOnly(studentCreateRoute), c => {
  return c.get('container').studentController.createStudent(c);
});
apiV1.openapi(staffOnly(studentUpdateRoute), c => {
  return c.get('container').studentController.updateStudent(c);
});

// Staff routes
apiV1.openapi(staffOnly(staffListRoute), c => {
  return c.get('container').staffController.getAllStaffs(c);
});
apiV1.openapi(staffOnly(staffDetailRoute), c => {
  return c.get('container').staffController.getStaffById(c);
});

// Teacher routes
apiV1.post('/teachers', requireAuth, requireStaff, c => {
  return c.get('container').teacherController.createTeacher(c);
});
apiV1.openapi(staffOnly(teacherListRoute), c => {
  return c.get('container').teacherController.getAllTeachers(c);
});
apiV1.openapi(staffOnly(teacherDetailRoute), c => {
  return c.get('container').teacherController.getTeacherById(c);
});
apiV1.openapi(staffOnly(teacherUpdateRoute), c => {
  return c.get('container').teacherController.updateTeacher(c);
});
apiV1.openapi(staffOnly(teacherDeleteRoute), c => {
  return c.get('container').teacherController.deleteTeacher(c);
});

// Event routes
apiV1.openapi(authed(eventListRoute), c => {
  return c.get('container').eventController.getAllEvents(c);
});
apiV1.openapi(authed(eventDetailRoute), c => {
  return c.get('container').eventController.getEventById(c);
});
apiV1.get('/me/events', requireAuth, c => {
  return c.get('container').eventController.getMyEvents(c);
});
apiV1.openapi(authed(eventGatheringListRoute), c => {
  return c.get('container').gatheringController.getGatheringsByEventId(c);
});
apiV1.openapi(staffOnly(eventCreateRoute), c => {
  return c.get('container').eventController.createEvent(c);
});
apiV1.openapi(staffOnly(eventUpdateRoute), c => {
  return c.get('container').eventController.updateEvent(c);
});
apiV1.openapi(staffOnly(eventPatchRoute), c => {
  return c.get('container').eventController.patchEvent(c);
});
apiV1.openapi(staffOnly(eventDeleteRoute), c => {
  return c.get('container').eventController.deleteEvent(c);
});
apiV1.openapi(staffOnly(eventScheduleUpdateRoute), c => {
  return c.get('container').eventScheduleController.updateEventSchedule(c);
});
apiV1.openapi(staffOnly(eventNotificationSummaryRoute), c => {
  return c
    .get('container')
    .eventScheduleController.getEventNotificationSummary(c);
});

// Classroom routes
apiV1.openapi(staffOnly(classRoomListRoute), c => {
  return c.get('container').classRoomController.getAllClassrooms(c);
});
apiV1.openapi(staffOnly(classRoomDetailRoute), c => {
  return c.get('container').classRoomController.getClassroomById(c);
});
apiV1.openapi(staffOnly(classRoomCreateRoute), c => {
  return c.get('container').classRoomController.createClassroom(c);
});
apiV1.openapi(staffOnly(classRoomUpdateRoute), c => {
  return c.get('container').classRoomController.updateClassroom(c);
});
apiV1.openapi(staffOnly(classRoomDeleteRoute), c => {
  return c.get('container').classRoomController.deleteClassroom(c);
});

// Master import routes
apiV1.openapi(staffOnly(masterImportCreateRoute), c => {
  return c.get('container').masterImportController.createImport(c);
});
apiV1.openapi(staffOnly(masterImportDetailRoute), c => {
  return c.get('container').masterImportController.getImport(c);
});
apiV1.openapi(staffOnly(masterImportCommitRoute), c => {
  return c.get('container').masterImportController.commitImport(c);
});

// Gathering spot routes
apiV1.openapi(staffOnly(gatheringSpotListRoute), c => {
  return c.get('container').gatheringSpotController.getAllGatheringSpots(c);
});
apiV1.get('/gathering-spots/:gatheringSpotId', requireAuth, requireStaff, c => {
  return c.get('container').gatheringSpotController.getGatheringSpotById(c);
});
apiV1.openapi(staffOnly(gatheringSpotCreateRoute), c => {
  return c.get('container').gatheringSpotController.createGatheringSpot(c);
});
apiV1.openapi(staffOnly(gatheringSpotUpdateRoute), c => {
  return c.get('container').gatheringSpotController.updateGatheringSpot(c);
});
apiV1.delete(
  '/gathering-spots/:gatheringSpotId',
  requireAuth,
  requireStaff,
  c => {
    return c.get('container').gatheringSpotController.deleteGatheringSpot(c);
  }
);

// Gathering member routes
apiV1.openapi(staffOnly(gatheringMemberListRoute), c => {
  return c
    .get('container')
    .gatheringGroupMemberController.getGatheringMembers(c);
});
apiV1.openapi(staffOnly(gatheringMemberCreateRoute), c => {
  return c
    .get('container')
    .gatheringGroupMemberController.addGatheringMember(c);
});
apiV1.openapi(staffOnly(gatheringMemberDeleteRoute), c => {
  return c
    .get('container')
    .gatheringGroupMemberController.removeGatheringMember(c);
});

// Gathering routes
apiV1.openapi(staffOnly(gatheringListRoute), c => {
  return c.get('container').gatheringController.getAllGatherings(c);
});
apiV1.openapi(staffOnly(gatheringCreateRoute), c => {
  return c.get('container').gatheringController.createGathering(c);
});
apiV1.openapi(staffOnly(gatheringDeleteRoute), c => {
  return c.get('container').gatheringController.deleteGathering(c);
});

// Firebase token routes
apiV1.openapi(authed(firebaseTokenCreateRoute), c => {
  return c.get('container').firebaseTokenController.registerFirebaseToken(c);
});

// Notification schedule routes
apiV1.openapi(staffOnly(scheduleUpdateRoute), c => {
  return c.get('container').scheduleController.updateSchedule(c);
});

// Notification routes
apiV1.openapi(staffOnly(adminNotificationCreateRoute), c => {
  return c
    .get('container')
    .adminNotificationController.createManualNotification(c);
});
apiV1.openapi(staffOnly(adminNotificationListRoute), c => {
  return c
    .get('container')
    .adminNotificationManagementController.getAdminNotifications(c);
});
apiV1.openapi(staffOnly(adminNotificationDetailRoute), c => {
  return c
    .get('container')
    .adminNotificationManagementController.getAdminNotificationById(c);
});
apiV1.openapi(staffOnly(adminNotificationUpdateRoute), c => {
  return c
    .get('container')
    .adminNotificationManagementController.updateAdminNotification(c);
});
apiV1.openapi(staffOnly(adminNotificationDeleteRoute), c => {
  return c
    .get('container')
    .adminNotificationManagementController.deleteAdminNotification(c);
});

apiV1.openapi(staffOnly(notificationCreateRoute), c => {
  return c.get('container').notificationController.createNotification(c);
});
apiV1.openapi(staffOnly(notificationListRoute), c => {
  return c.get('container').notificationController.getNotifications(c);
});
apiV1.openapi(staffOnly(notificationDetailRoute), c => {
  return c.get('container').notificationController.getNotificationById(c);
});
apiV1.openapi(staffOnly(notificationUpdateRoute), c => {
  return c.get('container').notificationController.updateNotification(c);
});

apiV1.openapi(authed(myNotificationListRoute), c => {
  return c.get('container').mobileNotificationController.getNotifications(c);
});
apiV1.openapi(authed(myNotificationDetailRoute), c => {
  return c.get('container').mobileNotificationController.getNotificationById(c);
});

apiV1.openapi(staffOnly(notificationScheduleListRoute), c => {
  return c
    .get('container')
    .notificationScheduleController.getAllNotificationSchedules(c);
});
apiV1.openapi(staffOnly(notificationScheduleCreateRoute), c => {
  return c
    .get('container')
    .notificationScheduleController.createNotificationSchedule(c);
});
apiV1.openapi(staffOnly(notificationScheduleDetailRoute), c => {
  return c
    .get('container')
    .notificationScheduleController.getNotificationScheduleById(c);
});
apiV1.openapi(staffOnly(notificationScheduleDeleteRoute), c => {
  return c
    .get('container')
    .notificationScheduleController.deleteNotificationSchedule(c);
});

apiV1.openapi(staffOnly(testNotificationRoute), c => {
  return c.get('container').notificationController.sendTestNotification(c);
});

// Auth routes
apiV1.route('/auth', authRouter);

// Mount API v1
app.route('/api/v1', apiV1);

app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

/**
 * API仕様は認証を通さずに読めてしまうため、DOCS_ENABLED="true" の環境
 * (development/preview)でのみ公開する。未設定の本番では404を返す。
 */
const requireDocsEnabled: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  if (!isDocsEnabled(c.env)) return c.notFound();
  await next();
};

app.use('/openapi.json', requireDocsEnabled);
app.use('/docs', requireDocsEnabled);

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
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (!isValidEventDate(env.EVENT_DATE)) {
      if (!eventDateWarnLogged) {
        console.error(
          '[CRON] EVENT_DATE must be configured in YYYY-MM-DD format; notification delivery is disabled'
        );
        eventDateWarnLogged = true;
      }
      return;
    }

    const scheduledAt = new Date(event.scheduledTime);
    if (!isEventDate(env.EVENT_DATE, scheduledAt)) return;

    const container = createDIContainer(env);
    ctx.waitUntil(
      container.scheduledNotificationService.enqueueDueNotifications(
        scheduledAt
      )
    );
  },
  async queue(
    batch: MessageBatch<NotificationDeliveryMessage>,
    env: Env
  ): Promise<void> {
    const container = createDIContainer(env);
    await consumeNotificationDeliveryQueue(
      batch,
      container.scheduledNotificationService
    );
  },
};

type AllowedOriginRule =
  | {
      type: 'exact';
      origin: string;
    }
  | {
      type: 'pattern';
      pattern: RegExp;
    };

function getAllowedOriginRules(allowedOrigins: string): AllowedOriginRule[] {
  const cachedRules = allowedOriginRulesCache.get(allowedOrigins);
  if (cachedRules) {
    return cachedRules;
  }

  const rules = allowedOrigins
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(createAllowedOriginRule);

  allowedOriginRulesCache.set(allowedOrigins, rules);
  return rules;
}

function createAllowedOriginRule(allowedOrigin: string): AllowedOriginRule {
  if (!allowedOrigin.includes('*')) {
    return {
      type: 'exact',
      origin: allowedOrigin,
    };
  }

  const allowedOriginPattern = escapeRegExp(allowedOrigin).replace(
    /\\\*/g,
    '[^.]+'
  );
  return {
    type: 'pattern',
    pattern: new RegExp(`^${allowedOriginPattern}$`),
  };
}

function isAllowedOrigin(
  origin: string,
  allowedOriginRules: AllowedOriginRule[]
): boolean {
  return allowedOriginRules.some(rule => {
    if (rule.type === 'exact') {
      return origin === rule.origin;
    }
    return rule.pattern.test(origin);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
