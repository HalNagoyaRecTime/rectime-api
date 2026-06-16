import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDIContainer } from './di/container';
import { D1Database } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  TEST_FCM_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.get('/', c => {
  return c.json({
    message: 'Recreation Management API - Three Layer Architecture',
    version: '1.0.0',
    endpoints: {
      students: '/api/v1/students/{studentId}',
      events: '/api/v1/events',
      firebaseTokens: '/api/v1/firebase-tokens',
      testNotification: '/api/v1/notifications/test',
      runScheduledNotifications: '/api/v1/notifications/schedule/run',
    },
    swagger: '/swagger.yml',
  });
});

// API v1 routes
const apiV1 = new Hono<{ Bindings: Bindings }>();

// Student routes
apiV1.get('/students', c => {
  const container = createDIContainer(c.env);
  return container.studentController.getAllStudent(c);
});
apiV1.get('/students/:studentId', c => {
  const container = createDIContainer(c.env);
  return container.studentController.getStudentById(c);
});

// Event routes
apiV1.get('/events', c => {
  const container = createDIContainer(c.env);
  return container.eventController.getAllEvents(c);
});

apiV1.get('/events/:eventId', c => {
  const container = createDIContainer(c.env);
  return container.eventController.getEventById(c);
});

// Firebase token routes
apiV1.post('/firebase-tokens', c => {
  const container = createDIContainer(c.env);
  return container.firebaseTokenController.registerFirebaseToken(c);
});

// Notification routes
apiV1.post('/notifications/test', c => {
  const container = createDIContainer(c.env);
  return container.notificationController.sendTestNotification(c);
});

apiV1.post('/notifications/schedule/run', async c => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const now =
      body && typeof body.now === 'string' ? new Date(body.now) : new Date();

    if (Number.isNaN(now.getTime())) {
      return c.json({ error: 'Invalid now value' }, 400);
    }

    const container = createDIContainer(c.env);
    const result =
      await container.scheduledNotificationService.sendScheduledEventNotifications(
        now
      );
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

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    const container = createDIContainer(env);
    ctx.waitUntil(
      container.scheduledNotificationService.sendScheduledEventNotifications()
    );
  },
};
