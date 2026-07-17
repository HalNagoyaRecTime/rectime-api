import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createEntryRepository } from '../infrastructure/repositories/EntryRepository';
import { createClassRepository } from '../infrastructure/repositories/ClassRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationSendLogRepository } from '../infrastructure/repositories/NotificationSendLogRepository';
import { createScheduleRepository } from '../infrastructure/repositories/ScheduleRepository';
import { createStudentService } from '../application/services/StudentService';
import { createEventService } from '../application/services/EventService';
import { createEntryService } from '../application/services/EntryService';
import { createClassService } from '../application/services/ClassService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createScheduleService } from '../application/services/ScheduleService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createEventController } from '../presentation/controllers/EventController';
import { createEntryController } from '../presentation/controllers/EntryController';
import { createClassController } from '../presentation/controllers/ClassController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createScheduleController } from '../presentation/controllers/ScheduleController';
import { createDayScheduleRepository } from '../infrastructure/repositories/DayScheduleRepository';
import { createDayScheduleService } from '../application/services/DayScheduleService';
import { createDayScheduleController } from '../presentation/controllers/DayScheduleController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createAuthService } from '../application/services/authService';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const userRepository = createUserRepository(db);
  const studentRepository = createStudentRepository(db);
  const eventRepository = createEventRepository(db);
  const entryRepository = createEntryRepository(db);
  const classRepository = createClassRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationSendLogRepository = createNotificationSendLogRepository(db);
  // TODO: replace with DB-backed implementation（手順4で D1 から取得する実装に差し替える）
  const scheduleRepository = createScheduleRepository();
  const dayScheduleRepository = createDayScheduleRepository();

  // Services
  const authService = createAuthService(userRepository, env.AUTH_KV);
  const studentService = createStudentService(studentRepository);
  const eventService = createEventService(eventRepository);
  const entryService = createEntryService(entryRepository);
  const classService = createClassService(classRepository);
  const scheduleService = createScheduleService(scheduleRepository);
  const dayScheduleService = createDayScheduleService(dayScheduleRepository);
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
  const classController = createClassController(classService);
  const scheduleController = createScheduleController(scheduleService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(fcmService);
  const dayScheduleController = createDayScheduleController(dayScheduleService);

  return {
    authService,
    studentController,
    eventController,
    entryController,
    classController,
    scheduleController,
    firebaseTokenController,
    notificationController,
    dayScheduleController,
    scheduledNotificationService,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
