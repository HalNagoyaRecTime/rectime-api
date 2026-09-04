import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createStaffRepository } from '../infrastructure/repositories/StaffRepository';
import { createTeacherRepository } from '../infrastructure/repositories/TeacherRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createEventScheduleRepository } from '../infrastructure/repositories/EventScheduleRepository';
import { createClassRoomRepository } from '../infrastructure/repositories/ClassRoomRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationScheduleRepository } from '../infrastructure/repositories/NotificationScheduleRepository';
import { createNotificationRepository } from '../infrastructure/repositories/NotificationRepository';
import { createAdminNotificationRepository } from '../infrastructure/repositories/AdminNotificationRepository';
import { createAdminNotificationManagementRepository } from '../infrastructure/repositories/AdminNotificationManagementRepository';
import { createMobileNotificationRepository } from '../infrastructure/repositories/MobileNotificationRepository';
import { createGatheringSpotRepository } from '../infrastructure/repositories/GatheringSpotRepository';
import { createGatheringGroupMemberRepository } from '../infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringRepository } from '../infrastructure/repositories/GatheringRepository';
import { createScheduleRepository } from '../infrastructure/repositories/ScheduleRepository';
import { createNotificationDeliveryQueue } from '../infrastructure/queues/NotificationDeliveryQueue';
import { createStudentService } from '../application/services/StudentService';
import { createStaffService } from '../application/services/StaffService';
import { createTeacherService } from '../application/services/TeacherService';
import { createEventService } from '../application/services/EventService';
import { createEventScheduleService } from '../application/services/EventScheduleService';
import { createClassRoomService } from '../application/services/ClassRoomService';
import { createMasterImportService } from '../application/services/MasterImportService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createNotificationScheduleService } from '../application/services/NotificationScheduleService';
import { createNotificationService } from '../application/services/NotificationService';
import { createAdminNotificationService } from '../application/services/AdminNotificationService';
import { createAdminNotificationManagementService } from '../application/services/AdminNotificationManagementService';
import { createMobileNotificationService } from '../application/services/MobileNotificationService';
import { createGatheringSpotService } from '../application/services/GatheringSpotService';
import { createGatheringGroupMemberService } from '../application/services/GatheringGroupMemberService';
import { createGatheringService } from '../application/services/GatheringService';
import { createScheduleService } from '../application/services/ScheduleService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createStaffController } from '../presentation/controllers/StaffController';
import { createTeacherController } from '../presentation/controllers/TeacherController';
import { createEventController } from '../presentation/controllers/EventController';
import { createEventScheduleController } from '../presentation/controllers/EventScheduleController';
import { createClassRoomController } from '../presentation/controllers/ClassRoomController';
import { createMasterImportController } from '../presentation/controllers/MasterImportController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createAdminNotificationController } from '../presentation/controllers/AdminNotificationController';
import { createAdminNotificationManagementController } from '../presentation/controllers/AdminNotificationManagementController';
import { createNotificationScheduleController } from '../presentation/controllers/NotificationScheduleController';
import { createMobileNotificationController } from '../presentation/controllers/MobileNotificationController';
import { createGatheringSpotController } from '../presentation/controllers/GatheringSpotController';
import { createGatheringGroupMemberController } from '../presentation/controllers/GatheringGroupMemberController';
import { createGatheringController } from '../presentation/controllers/GatheringController';
import { createScheduleController } from '../presentation/controllers/ScheduleController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createUserActivationRepository } from '../infrastructure/repositories/UserActivationRepository';
import { createUserSearchRepository } from '../infrastructure/repositories/UserSearchRepository';
import { createAuthService } from '../application/services/authService';
import { createAuthorizationService } from '../application/services/AuthorizationService';
import { createUserSearchService } from '../application/services/UserSearchService';
import { createUserSearchController } from '../presentation/controllers/UserSearchController';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const userRepository = createUserRepository(db);
  const userActivationRepository = createUserActivationRepository(db);
  const userSearchRepository = createUserSearchRepository(db);
  const studentRepository = createStudentRepository(db);
  const staffRepository = createStaffRepository(db);
  const teacherRepository = createTeacherRepository(db);
  const eventRepository = createEventRepository(db);
  const eventScheduleRepository = createEventScheduleRepository(db);
  const classRoomRepository = createClassRoomRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationScheduleRepository =
    createNotificationScheduleRepository(db);
  const notificationRepository = createNotificationRepository(db);
  const adminNotificationRepository = createAdminNotificationRepository(db);
  const adminNotificationManagementRepository =
    createAdminNotificationManagementRepository(db);
  const mobileNotificationRepository = createMobileNotificationRepository(db);
  const gatheringSpotRepository = createGatheringSpotRepository(db);
  const gatheringGroupMemberRepository = createGatheringGroupMemberRepository(
    db,
    userRepository
  );
  const gatheringRepository = createGatheringRepository(
    db,
    eventRepository,
    gatheringSpotRepository
  );
  const scheduleRepository = createScheduleRepository(db);
  const notificationDeliveryQueue = createNotificationDeliveryQueue(
    env.NOTIFICATION_DELIVERY_QUEUE
  );

  // Services
  const authService = createAuthService(
    userRepository,
    studentRepository,
    env.STUDENT_EMAIL_DOMAIN
  );
  const authorizationService = createAuthorizationService(userRepository);
  const userSearchService = createUserSearchService(userSearchRepository);
  const studentService = createStudentService(
    studentRepository,
    classRoomRepository
  );
  const staffService = createStaffService(staffRepository);
  const teacherService = createTeacherService(teacherRepository);
  const eventService = createEventService(eventRepository);
  const eventScheduleService = createEventScheduleService({
    eventRepository,
    eventScheduleRepository,
    notificationScheduleRepository,
  });
  const classRoomService = createClassRoomService(classRoomRepository);
  const masterImportService = createMasterImportService(
    env.AUTH_KV,
    env.MASTER_IMPORT_COMMIT_LOCK,
    studentService,
    classRoomService,
    teacherService
  );
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
    notificationDeliveryQueue,
    fcmService,
  });
  const notificationScheduleService = createNotificationScheduleService(
    notificationScheduleRepository
  );
  const notificationService = createNotificationService(notificationRepository);
  const adminNotificationService = createAdminNotificationService(
    adminNotificationRepository
  );
  const adminNotificationManagementService =
    createAdminNotificationManagementService(
      adminNotificationManagementRepository,
      adminNotificationRepository
    );
  const mobileNotificationService = createMobileNotificationService(
    mobileNotificationRepository
  );
  const gatheringSpotService = createGatheringSpotService(
    gatheringSpotRepository
  );
  const gatheringGroupMemberService = createGatheringGroupMemberService(
    gatheringGroupMemberRepository
  );
  const gatheringService = createGatheringService(gatheringRepository);
  const scheduleService = createScheduleService(scheduleRepository);

  // Controllers
  const studentController = createStudentController(studentService);
  const staffController = createStaffController(staffService);
  const teacherController = createTeacherController(teacherService);
  const eventController = createEventController(
    eventService,
    eventScheduleService
  );
  const eventScheduleController =
    createEventScheduleController(eventScheduleService);
  const classRoomController = createClassRoomController(classRoomService);
  const masterImportController =
    createMasterImportController(masterImportService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(
    fcmService,
    notificationService
  );
  const adminNotificationController = createAdminNotificationController(
    adminNotificationService
  );
  const adminNotificationManagementController =
    createAdminNotificationManagementController(
      adminNotificationManagementService
    );
  const userSearchController = createUserSearchController(userSearchService);
  const notificationScheduleController = createNotificationScheduleController(
    notificationScheduleService
  );
  const mobileNotificationController = createMobileNotificationController(
    mobileNotificationService
  );
  const gatheringSpotController =
    createGatheringSpotController(gatheringSpotService);
  const gatheringGroupMemberController = createGatheringGroupMemberController(
    gatheringGroupMemberService
  );
  const gatheringController = createGatheringController(gatheringService);
  const scheduleController = createScheduleController(scheduleService);

  return {
    // requireAuth（ミドルウェア）が直接参照するため、リポジトリのまま公開する
    userActivationRepository,
    authService,
    authorizationService,
    studentService,
    studentController,
    staffController,
    teacherController,
    eventController,
    eventScheduleController,
    classRoomController,
    masterImportController,
    firebaseTokenController,
    notificationController,
    adminNotificationController,
    adminNotificationManagementController,
    userSearchController,
    notificationScheduleController,
    mobileNotificationController,
    scheduledNotificationService,
    gatheringSpotController,
    gatheringGroupMemberController,
    gatheringController,
    scheduleController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
