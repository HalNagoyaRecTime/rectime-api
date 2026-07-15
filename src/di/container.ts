import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createClassRepository } from '../infrastructure/repositories/ClassRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationSendLogRepository } from '../infrastructure/repositories/NotificationSendLogRepository';
import { createStudentService } from '../application/services/StudentService';
import { createEventService } from '../application/services/EventService';
import { createClassService } from '../application/services/ClassService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createEventController } from '../presentation/controllers/EventController';
import { createClassController } from '../presentation/controllers/ClassController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createAuthService } from '../application/services/authService';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const userRepository = createUserRepository(db);
  const studentRepository = createStudentRepository(db);
  const eventRepository = createEventRepository(db);
  const classRepository = createClassRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationSendLogRepository = createNotificationSendLogRepository(db);

  // Services
  const authService = createAuthService(userRepository, env.AUTH_KV);
  const studentService = createStudentService(studentRepository);
  const eventService = createEventService(eventRepository);
  const classService = createClassService(classRepository);
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
  const classController = createClassController(classService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(fcmService);

  return {
    authService,
    studentController,
    eventController,
    classController,
    firebaseTokenController,
    notificationController,
    scheduledNotificationService,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
