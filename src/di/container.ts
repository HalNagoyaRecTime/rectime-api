import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createEntryRepository } from '../infrastructure/repositories/EntryRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationSendLogRepository } from '../infrastructure/repositories/NotificationSendLogRepository';
import { createStudentService } from '../infrastructure/services/StudentService';
import { createEventService } from '../infrastructure/services/EventService';
import { createEntryService } from '../infrastructure/services/EntryService';
import { createFirebaseTokenService } from '../infrastructure/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../infrastructure/services/ScheduledNotificationService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createEventController } from '../presentation/controllers/EventController';
import { createEntryController } from '../presentation/controllers/EntryController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { D1Database } from '@cloudflare/workers-types';

type Env = {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  TEST_FCM_TOKEN: string;
};

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const studentRepository = createStudentRepository(db);
  const eventRepository = createEventRepository(db);
  const entryRepository = createEntryRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationSendLogRepository = createNotificationSendLogRepository(db);

  // Services
  const studentService = createStudentService(studentRepository);
  const eventService = createEventService(eventRepository);
  const entryService = createEntryService(entryRepository);
  const firebaseTokenService = createFirebaseTokenService(
    firebaseTokenRepository
  );
  const fcmService = createFcmService({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
    testFcmToken: env.TEST_FCM_TOKEN,
  });
  const scheduledNotificationService = createScheduledNotificationService({
    eventRepository,
    firebaseTokenRepository,
    notificationSendLogRepository,
    fcmService,
  });

  // Controllers
  const studentController = createStudentController(studentService);
  const eventController = createEventController(eventService);
  const entryController = createEntryController(entryService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(fcmService);

  return {
    studentController,
    eventController,
    entryController,
    firebaseTokenController,
    notificationController,
    scheduledNotificationService,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
