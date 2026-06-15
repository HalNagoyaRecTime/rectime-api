import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './lib/db';
import { createStudentRepository } from './repositories/StudentRepository';
import { createStudentService } from './services/StudentService';
import { createStudentController } from './controllers/StudentController';
import { createEventRepository } from './repositories/EventRepository';
import { createEventService } from './services/EventService';
import { createEventController } from './controllers/EventController';
import { createFcmService } from './services/FcmService';
import { createNotificationController } from './controllers/NotificationController';
import { createFirebaseTokenRepository } from './repositories/FirebaseTokenRepository';
import { createFirebaseTokenService } from './services/FirebaseTokenService';
import { createFirebaseTokenController } from './controllers/FirebaseTokenController';
import { sendScheduledEventNotifications } from './services/ScheduledNotificationService';
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
  const db = getDb(c.env);
  const studentRepository = createStudentRepository(db);
  const studentService = createStudentService(studentRepository);
  const studentController = createStudentController(studentService);
  return studentController.getAllStudent(c);
});
apiV1.get('/students/:studentId', c => {
  const db = getDb(c.env);
  const studentRepository = createStudentRepository(db);
  const studentService = createStudentService(studentRepository);
  const studentController = createStudentController(studentService);
  return studentController.getStudentById(c);
});

// Event routes
apiV1.get('/events', c => {
  const db = getDb(c.env);
  const eventRepository = createEventRepository(db);
  const eventService = createEventService(eventRepository);
  const eventController = createEventController(eventService);
  return eventController.getAllEvents(c);
});

apiV1.get('/events/:eventId', c => {
  const db = getDb(c.env);
  const eventRepository = createEventRepository(db);
  const eventService = createEventService(eventRepository);
  const eventController = createEventController(eventService);
  return eventController.getEventById(c);
});

// Firebase token routes
apiV1.post('/firebase-tokens', c => {
  const db = getDb(c.env);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const firebaseTokenService = createFirebaseTokenService(
    firebaseTokenRepository
  );
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  return firebaseTokenController.registerFirebaseToken(c);
});

// Notification routes
apiV1.post('/notifications/test', c => {
  const fcmService = createFcmService({
    projectId: c.env.FIREBASE_PROJECT_ID,
    clientEmail: c.env.FIREBASE_CLIENT_EMAIL,
    privateKey: c.env.FIREBASE_PRIVATE_KEY,
    testFcmToken: c.env.TEST_FCM_TOKEN,
  });
  const notificationController = createNotificationController(fcmService);
  return notificationController.sendTestNotification(c);
});

apiV1.post('/notifications/schedule/run', async c => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const now =
      body && typeof body.now === 'string' ? new Date(body.now) : new Date();

    if (Number.isNaN(now.getTime())) {
      return c.json({ error: 'Invalid now value' }, 400);
    }

    const result = await sendScheduledEventNotifications(c.env, now);
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
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const result = await sendScheduledEventNotifications(
          env,
          new Date(event.scheduledTime)
        );
        console.log('Scheduled notifications completed', {
          cron: event.cron,
          scheduledTime: new Date(event.scheduledTime).toISOString(),
          ...result,
        });
      })()
    );
  },
};
