import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './lib/db';
import { createStudentRepository } from './repositories/StudentRepository';
import { createStudentService } from './services/StudentService';
import { createStudentController } from './controllers/StudentController';
import { createEventRepository } from './repositories/EventRepository';
import { createEventService } from './services/EventService';
import { createEventController } from './controllers/EventController';
import { D1Database } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
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
    },
    swagger: '/swagger.yml',
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

// Mount API v1
app.route('/api/v1', apiV1);

export default app;
