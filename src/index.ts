import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './presentation/auth/router';
import { createDIContainer } from './di/container';
import type { Env } from './lib/env';
import { isEventDate, isValidEventDate } from './lib/eventDate';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from './presentation/middleware/diContainer';
import {
  sessionAuthenticationMiddleware,
  type AuthenticationVariables,
} from './presentation/middleware/sessionAuthentication';

const app = new Hono<{ Bindings: Env }>();

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

app.get('/health', c => c.json({ status: 'ok' }));

app.get('/', c => {
  return c.json({
    message: 'rectime_be',
    version: '1.0.0',
    endpoints: {
      students: '/api/v1/students/{studentId}',
      staffs: '/api/v1/staffs/{staffId}',
      teachers: '/api/v1/teachers/{teacherId}',
      events: '/api/v1/events',
      classRooms: '/api/v1/classrooms',
      gatheringSpots: '/api/v1/gathering-spots',
      gatheringGroups: '/api/v1/gathering-groups',
      gatherings: '/api/v1/gatherings',
      schedules: '/api/v1/notification/schedules',
      firebaseTokens: '/api/v1/firebase-tokens',
      notifications: '/api/v1/notifications',
      testNotification: '/api/v1/notifications/test',
      notificationSchedules: '/api/v1/notification-schedules',
    },
    swagger: '/swagger.yml',
  });
});

// API v1 routes
const apiV1 = new Hono<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>();

apiV1.use('*', diContainerMiddleware);
apiV1.use('*', sessionAuthenticationMiddleware);

// Student routes
apiV1.get('/students', c => {
  return c.get('container').studentController.getAllStudent(c);
});
apiV1.get('/students/:studentId', c => {
  return c.get('container').studentController.getStudentById(c);
});
apiV1.post('/students', c => {
  return c.get('container').studentController.createStudent(c);
});
apiV1.put('/students/:studentId', c => {
  return c.get('container').studentController.updateStudent(c);
});

// Staff routes
apiV1.get('/staffs', c => {
  return c.get('container').staffController.getAllStaffs(c);
});
apiV1.get('/staffs/:staffId', c => {
  return c.get('container').staffController.getStaffById(c);
});

// Teacher routes
apiV1.get('/teachers', c => {
  return c.get('container').teacherController.getAllTeachers(c);
});
apiV1.get('/teachers/:teacherId', c => {
  return c.get('container').teacherController.getTeacherById(c);
});
apiV1.put('/teachers/:teacherId', c => {
  return c.get('container').teacherController.updateTeacher(c);
});
apiV1.delete('/teachers/:teacherId', c => {
  return c.get('container').teacherController.deleteTeacher(c);
});

// Event routes
apiV1.get('/events', c => {
  return c.get('container').eventController.getAllEvents(c);
});

apiV1.get('/events/:eventId', c => {
  return c.get('container').eventController.getEventById(c);
});
apiV1.post('/events', c => {
  return c.get('container').eventController.createEvent(c);
});
apiV1.put('/events/:eventId', c => {
  return c.get('container').eventController.updateEvent(c);
});
apiV1.delete('/events/:eventId', c => {
  return c.get('container').eventController.deleteEvent(c);
});
apiV1.put('/events/:eventId/schedule', c => {
  return c.get('container').eventScheduleController.updateEventSchedule(c);
});

// Classroom routes
apiV1.get('/classrooms', c => {
  return c.get('container').classRoomController.getAllClassrooms(c);
});
apiV1.get('/classrooms/:classId', c => {
  return c.get('container').classRoomController.getClassroomById(c);
});
apiV1.post('/classrooms', c => {
  return c.get('container').classRoomController.createClassroom(c);
});
apiV1.put('/classrooms/:classId', c => {
  return c.get('container').classRoomController.updateClassroom(c);
});
apiV1.delete('/classrooms/:classId', c => {
  return c.get('container').classRoomController.deleteClassroom(c);
});

// Gathering spot routes
apiV1.get('/gathering-spots', c => {
  return c.get('container').gatheringSpotController.getAllGatheringSpots(c);
});
apiV1.post('/gathering-spots', c => {
  return c.get('container').gatheringSpotController.createGatheringSpot(c);
});

// Gathering group routes
apiV1.get('/gathering-groups', c => {
  return c.get('container').gatheringGroupController.getAllGatheringGroups(c);
});
apiV1.post('/gathering-groups', c => {
  return c.get('container').gatheringGroupController.createGatheringGroup(c);
});
apiV1.get('/gathering-groups/:gatheringGroupId/members', c => {
  return c
    .get('container')
    .gatheringGroupMemberController.getGatheringGroupMembers(c);
});
apiV1.post('/gathering-groups/:gatheringGroupId/members', c => {
  return c
    .get('container')
    .gatheringGroupMemberController.addGatheringGroupMember(c);
});
apiV1.delete('/gathering-groups/:gatheringGroupId/members/:userId', c => {
  return c
    .get('container')
    .gatheringGroupMemberController.removeGatheringGroupMember(c);
});

// Gathering routes
apiV1.get('/gatherings', c => {
  return c.get('container').gatheringController.getAllGatherings(c);
});
apiV1.post('/gatherings', c => {
  return c.get('container').gatheringController.createGathering(c);
});

// Firebase token routes
apiV1.post('/firebase-tokens', c => {
  return c.get('container').firebaseTokenController.registerFirebaseToken(c);
});

// Notification schedule routes
apiV1.get('/notification/schedules', c => {
  return c.get('container').scheduleController.getAllSchedules(c);
});
apiV1.get('/notification/schedules/:scheduleId', c => {
  return c.get('container').scheduleController.getScheduleById(c);
});
apiV1.get('/notification/schedules/history/:user_id', c => {
  return c.get('container').scheduleController.getHistorySchedules(c);
});

// Notification routes
apiV1.post('/notifications', c => {
  return c.get('container').notificationController.createNotification(c);
});
apiV1.get('/notifications', c => {
  return c.get('container').notificationController.getNotifications(c);
});
apiV1.get('/notifications/:id', c => {
  return c.get('container').notificationController.getNotificationById(c);
});
apiV1.put('/notifications/:id', c => {
  return c.get('container').notificationController.updateNotification(c);
});

apiV1.get('/notification-schedules', c => {
  return c
    .get('container')
    .notificationScheduleController.getAllNotificationSchedules(c);
});
apiV1.post('/notification-schedules', c => {
  return c
    .get('container')
    .notificationScheduleController.createNotificationSchedule(c);
});
apiV1.get('/notification-schedules/:id', c => {
  return c
    .get('container')
    .notificationScheduleController.getNotificationScheduleById(c);
});
apiV1.delete('/notification-schedules/:id', c => {
  return c
    .get('container')
    .notificationScheduleController.deleteNotificationSchedule(c);
});

apiV1.post('/notifications/test', c => {
  return c.get('container').notificationController.sendTestNotification(c);
});

// Auth routes
apiV1.route('/auth', authRouter);

// Mount API v1
app.route('/api/v1', apiV1);

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
      container.scheduledNotificationService.sendScheduledEventNotifications(
        scheduledAt
      )
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
