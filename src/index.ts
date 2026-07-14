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

app.get('/health', c => c.json({ status: 'ok' }));

app.get('/', c => {
  return c.json({
    message: 'rectime_be',
    version: '1.0.0',
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

// Firebase token routes
apiV1.post('/firebase-tokens', c => {
  return c.get('container').firebaseTokenController.registerFirebaseToken(c);
});

// Notification routes
apiV1.post('/admin/notifications', c => {
  return c.get('container').notificationController.sendManualNotification(c);
});

apiV1.post('/notifications/test', c => {
  return c.get('container').notificationController.sendTestNotification(c);
});

apiV1.post('/notifications/schedule/run', c => {
  return c.get('container').notificationController.runScheduledNotifications(c);
});

// Mount API v1
app.route('/api/v1', apiV1);

export { app };

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const container = createDIContainer(env);
    ctx.waitUntil(
      (async () => {
        const result =
          await container.scheduledNotificationService.sendScheduledEventNotifications(
            new Date(event.scheduledTime)
          );
        if (env.NODE_ENV === 'development') {
          console.info('Scheduled notifications completed', {
            cron: event.cron,
            scheduledTime: new Date(event.scheduledTime).toISOString(),
            ...result,
          });
        }
      })()
    );
  },
};
