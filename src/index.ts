import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './lib/db';
import { createStudentRepository } from './repositories/StudentRepository';
import { createStudentService } from './services/StudentService';
import { createStudentController } from './controllers/StudentController';
import { createEventRepository } from './repositories/EventRepository';
import { createEventService } from './services/EventService';
import { createEventController } from './controllers/EventController';
import { authRouter } from './auth/router';
import type { Bindings } from './types/bindings';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', (c, next) => {
  const origins = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    console.warn(
      '[CORS] ALLOWED_ORIGINS is not set — all cross-origin requests will be blocked'
    );
  }
  return cors({
    origin: origin => (origins.includes(origin) ? origin : null),
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

app.get('/', c => {
  return c.json({
    message: 'rectime_be',
    version: '1.0.0',
  });
});

// API v1 routes
const apiV1 = new Hono<{ Bindings: Bindings }>();

// Student routes
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

// Auth routes
apiV1.route('/auth', authRouter);

// Mount API v1
app.route('/api/v1', apiV1);

export default app;
