import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createEventScheduleRepository } from '../infrastructure/repositories/EventScheduleRepository';
import { createClassRepository } from '../infrastructure/repositories/ClassRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationScheduleRepository } from '../infrastructure/repositories/NotificationScheduleRepository';
import { createNotificationRepository } from '../infrastructure/repositories/NotificationRepository';
import { createGatheringSpotRepository } from '../infrastructure/repositories/GatheringSpotRepository';
import { createGatheringGroupRepository } from '../infrastructure/repositories/GatheringGroupRepository';
import { createGatheringGroupMemberRepository } from '../infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringRepository } from '../infrastructure/repositories/GatheringRepository';
import { createStudentService } from '../application/services/StudentService';
import { createEventService } from '../application/services/EventService';
import { createEventScheduleService } from '../application/services/EventScheduleService';
import { createClassService } from '../application/services/ClassService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createNotificationScheduleService } from '../application/services/NotificationScheduleService';
import { createNotificationService } from '../application/services/NotificationService';
import { createGatheringSpotService } from '../application/services/GatheringSpotService';
import { createGatheringGroupService } from '../application/services/GatheringGroupService';
import { createGatheringGroupMemberService } from '../application/services/GatheringGroupMemberService';
import { createGatheringService } from '../application/services/GatheringService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createEventController } from '../presentation/controllers/EventController';
import { createEventScheduleController } from '../presentation/controllers/EventScheduleController';
import { createClassController } from '../presentation/controllers/ClassController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createNotificationScheduleController } from '../presentation/controllers/NotificationScheduleController';
import { createGatheringSpotController } from '../presentation/controllers/GatheringSpotController';
import { createGatheringGroupController } from '../presentation/controllers/GatheringGroupController';
import { createGatheringGroupMemberController } from '../presentation/controllers/GatheringGroupMemberController';
import { createGatheringController } from '../presentation/controllers/GatheringController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createAuthService } from '../application/services/authService';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const userRepository = createUserRepository(db);
  const studentRepository = createStudentRepository(db);
  const eventRepository = createEventRepository(db);
  const eventScheduleRepository = createEventScheduleRepository(db);
  const classRepository = createClassRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationScheduleRepository =
    createNotificationScheduleRepository(db);
  const notificationRepository = createNotificationRepository(db);
  const gatheringSpotRepository = createGatheringSpotRepository(db);
  const gatheringGroupRepository = createGatheringGroupRepository(db);
  const gatheringGroupMemberRepository =
    createGatheringGroupMemberRepository(db);
  const gatheringRepository = createGatheringRepository(db);

  // Services
  const authService = createAuthService(userRepository, env.AUTH_KV);
  const studentService = createStudentService(studentRepository);
  const eventService = createEventService(eventRepository);
  const eventScheduleService = createEventScheduleService({
    eventRepository,
    eventScheduleRepository,
    notificationScheduleRepository,
    userRepository,
  });
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
    firebaseTokenRepository,
    notificationScheduleRepository,
    fcmService,
  });
  const notificationScheduleService = createNotificationScheduleService(
    notificationScheduleRepository
  );
  const notificationService = createNotificationService(notificationRepository);
  const gatheringSpotService = createGatheringSpotService(
    gatheringSpotRepository
  );
  const gatheringGroupService = createGatheringGroupService(
    gatheringGroupRepository
  );
  const gatheringGroupMemberService = createGatheringGroupMemberService(
    gatheringGroupMemberRepository
  );
  const gatheringService = createGatheringService(gatheringRepository);

  // Controllers
  const studentController = createStudentController(studentService);
  const eventController = createEventController(eventService);
  const eventScheduleController =
    createEventScheduleController(eventScheduleService);
  const classController = createClassController(classService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(
    fcmService,
    notificationService
  );
  const notificationScheduleController = createNotificationScheduleController(
    notificationScheduleService
  );
  const gatheringSpotController =
    createGatheringSpotController(gatheringSpotService);
  const gatheringGroupController = createGatheringGroupController(
    gatheringGroupService
  );
  const gatheringGroupMemberController = createGatheringGroupMemberController(
    gatheringGroupMemberService
  );
  const gatheringController = createGatheringController(gatheringService);

  return {
    authService,
    studentController,
    eventController,
    eventScheduleController,
    classController,
    firebaseTokenController,
    notificationController,
    notificationScheduleController,
    scheduledNotificationService,
    gatheringSpotController,
    gatheringGroupController,
    gatheringGroupMemberController,
    gatheringController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
