import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDIContainer } from './di/container';
import type { Env } from './lib/env';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from './presentation/middleware/diContainer';

const app = new Hono<{ Bindings: Env }>();

let corsWarnLogged = false;
const allowedOriginRulesCache = new Map<string, AllowedOriginRule[]>();
let tenantWarnLogged = false;

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

app.get('/health', c => c.json({ status: 'ok' }));

app.get('/', c => {
  return c.json({
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
      notifications: '/api/v1/notifications',
      testNotification: '/api/v1/notifications/test',
      notificationSchedules: '/api/v1/notification-schedules',
      runScheduledNotifications: '/api/v1/notifications/schedule/run',
    },
    swagger: '/swagger.yml',
  });
});

// API v1 routes
const apiV1 = new Hono<{ Bindings: Env; Variables: ContainerVariables }>();

apiV1.use('*', diContainerMiddleware);

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

// Event routes
apiV1.get('/events', c => {
  return c.get('container').eventController.getAllEvents(c);
});

apiV1.get('/events/:eventId', c => {
  return c.get('container').eventController.getEventById(c);
});

// Class routes
apiV1.get('/classes', c => {
  return c.get('container').classController.getAllClasses(c);
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

apiV1.post('/notifications/test', c => {
  return c.get('container').notificationController.sendTestNotification(c);
});

apiV1.post('/notifications/schedule/run', async c => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const now =
      body && typeof body.now === 'string' ? new Date(body.now) : new Date();

    if (Number.isNaN(now.getTime())) {
      return c.json({ error: 'Invalid now value' }, 400);
    }

    const result = await c
      .get('container')
      .scheduledNotificationService.sendScheduledEventNotifications(now);
    return c.json(result);
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
