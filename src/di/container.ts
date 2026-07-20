import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createStudentMasterRepository } from '../infrastructure/repositories/StudentMasterRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createClassRepository } from '../infrastructure/repositories/ClassRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationScheduleRepository } from '../infrastructure/repositories/NotificationScheduleRepository';
import { createGatheringSpotRepository } from '../infrastructure/repositories/GatheringSpotRepository';
import { createGatheringGroupRepository } from '../infrastructure/repositories/GatheringGroupRepository';
import { createGatheringGroupMemberRepository } from '../infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringRepository } from '../infrastructure/repositories/GatheringRepository';
import { createStudentService } from '../application/services/StudentService';
import { createStudentMasterService } from '../application/services/StudentMasterService';
import { createEventService } from '../application/services/EventService';
import { createClassService } from '../application/services/ClassService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createNotificationScheduleService } from '../application/services/NotificationScheduleService';
import { createGatheringSpotService } from '../application/services/GatheringSpotService';
import { createGatheringGroupService } from '../application/services/GatheringGroupService';
import { createGatheringGroupMemberService } from '../application/services/GatheringGroupMemberService';
import { createGatheringService } from '../application/services/GatheringService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createStudentMasterController } from '../presentation/controllers/StudentMasterController';
import { createEventController } from '../presentation/controllers/EventController';
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
  const studentMasterRepository = createStudentMasterRepository(db);
  const eventRepository = createEventRepository(db);
  const classRepository = createClassRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationScheduleRepository =
    createNotificationScheduleRepository(db);
  const gatheringSpotRepository = createGatheringSpotRepository(db);
  const gatheringGroupRepository = createGatheringGroupRepository(db);
  const gatheringGroupMemberRepository =
    createGatheringGroupMemberRepository(db);
  const gatheringRepository = createGatheringRepository(db);

  // Services
  const authService = createAuthService(userRepository, env.AUTH_KV);
  const studentService = createStudentService(
    studentRepository,
    classRepository
  );
  const studentMasterService = createStudentMasterService(
    studentMasterRepository
  );
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
    firebaseTokenRepository,
    notificationScheduleRepository,
    fcmService,
  });
  const notificationScheduleService = createNotificationScheduleService(
    notificationScheduleRepository
  );
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
  const studentMasterController =
    createStudentMasterController(studentMasterService);
  const eventController = createEventController(eventService);
  const classController = createClassController(classService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(fcmService);
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
    studentMasterController,
    eventController,
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
