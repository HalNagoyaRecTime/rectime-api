import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createStaffRepository } from '../infrastructure/repositories/StaffRepository';
import { createTeacherRepository } from '../infrastructure/repositories/TeacherRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createClassRoomRepository } from '../infrastructure/repositories/ClassRoomRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationScheduleRepository } from '../infrastructure/repositories/NotificationScheduleRepository';
import { createAdminNotificationRepository } from '../infrastructure/repositories/AdminNotificationRepository';
import { createAdminNotificationCommandRepository } from '../infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../infrastructure/repositories/NotificationAudienceResolverRepository';
import { createAdminNotificationManagementRepository } from '../infrastructure/repositories/AdminNotificationManagementRepository';
import { createMobileNotificationRepository } from '../infrastructure/repositories/MobileNotificationRepository';
import { createGatheringSpotRepository } from '../infrastructure/repositories/GatheringSpotRepository';
import { createVenueRepository } from '../infrastructure/repositories/VenueRepository';
import { createGatheringGroupMemberRepository } from '../infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringRepository } from '../infrastructure/repositories/GatheringRepository';
import { createEventGatheringSettingsRepository } from '../infrastructure/repositories/EventGatheringSettingsRepository';
import { createNotificationDeliveryQueue } from '../infrastructure/queues/NotificationDeliveryQueue';
import { createStudentService } from '../application/services/StudentService';
import { createStaffService } from '../application/services/StaffService';
import { createTeacherService } from '../application/services/TeacherService';
import { createEventService } from '../application/services/EventService';
import { createClassRoomService } from '../application/services/ClassRoomService';
import { createMasterImportService } from '../application/services/MasterImportService';
import { createFirebaseTokenService } from '../application/services/FirebaseTokenService';
import { createFcmService } from '../infrastructure/services/FcmService';
import { createScheduledNotificationService } from '../application/services/ScheduledNotificationService';
import { createNotificationAudienceResolverService } from '../application/services/NotificationAudienceResolverService';
import { createAdminNotificationService } from '../application/services/AdminNotificationService';
import { createAdminNotificationManagementService } from '../application/services/AdminNotificationManagementService';
import { createAdminNotificationCommandService } from '../application/services/AdminNotificationCommandService';
import { createMobileNotificationService } from '../application/services/MobileNotificationService';
import { createGatheringSpotService } from '../application/services/GatheringSpotService';
import { createVenueService } from '../application/services/VenueService';
import { createGatheringGroupMemberService } from '../application/services/GatheringGroupMemberService';
import { createGatheringService } from '../application/services/GatheringService';
import { createEventGatheringSettingsService } from '../application/services/EventGatheringSettingsService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createStaffController } from '../presentation/controllers/StaffController';
import { createTeacherController } from '../presentation/controllers/TeacherController';
import { createEventController } from '../presentation/controllers/EventController';
import { createClassRoomController } from '../presentation/controllers/ClassRoomController';
import { createMasterImportController } from '../presentation/controllers/MasterImportController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createAdminNotificationController } from '../presentation/controllers/AdminNotificationController';
import { createAdminNotificationManagementController } from '../presentation/controllers/AdminNotificationManagementController';
import { createAdminNotificationCommandController } from '../presentation/controllers/AdminNotificationCommandController';
import { createMobileNotificationController } from '../presentation/controllers/MobileNotificationController';
import { createGatheringSpotController } from '../presentation/controllers/GatheringSpotController';
import { createVenueController } from '../presentation/controllers/VenueController';
import { createGatheringGroupMemberController } from '../presentation/controllers/GatheringGroupMemberController';
import { createGatheringController } from '../presentation/controllers/GatheringController';
import { createEventGatheringSettingsController } from '../presentation/controllers/EventGatheringSettingsController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createUserStatusRepository } from '../infrastructure/repositories/UserStatusRepository';
import { createUserStatusService } from '../application/services/UserStatusService';
import { createUserStatusController } from '../presentation/controllers/UserStatusController';
import { createAuthService } from '../application/services/authService';
import { createAccountDeletionService } from '../application/services/AccountDeletionService';
import { createAuthorizationService } from '../application/services/AuthorizationService';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const db = getDb(env);

  // Repositories
  const userRepository = createUserRepository(db);
  const userStatusRepository = createUserStatusRepository(db);
  const studentRepository = createStudentRepository(db);
  const staffRepository = createStaffRepository(db);
  const teacherRepository = createTeacherRepository(db);
  const eventRepository = createEventRepository(db);
  const classRoomRepository = createClassRoomRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationScheduleRepository =
    createNotificationScheduleRepository(db);
  const adminNotificationRepository = createAdminNotificationRepository(db);
  const adminNotificationManagementRepository =
    createAdminNotificationManagementRepository(db);
  const adminNotificationCommandRepository =
    createAdminNotificationCommandRepository(db);
  const notificationAudienceResolverRepository =
    createNotificationAudienceResolverRepository(db);
  const mobileNotificationRepository = createMobileNotificationRepository(db);
  const gatheringSpotRepository = createGatheringSpotRepository(db);
  const venueRepository = createVenueRepository(db);
  const gatheringGroupMemberRepository =
    createGatheringGroupMemberRepository(db);
  const gatheringRepository = createGatheringRepository(db, eventRepository);
  const eventGatheringSettingsRepository =
    createEventGatheringSettingsRepository(db);
  const notificationDeliveryQueue = createNotificationDeliveryQueue(
    env.NOTIFICATION_DELIVERY_QUEUE
  );

  // Services
  const authService = createAuthService(
    userRepository,
    studentRepository,
    teacherRepository,
    env.STUDENT_EMAIL_DOMAIN,
    env.AUTH_KV,
    firebaseTokenRepository
  );
  const userStatusService = createUserStatusService(userStatusRepository);
  const authorizationService = createAuthorizationService(userRepository);
  // #265: 関連データの削除・匿名化(deleteRelatedData)は
  // DELETE /auth/me(account.ts)から呼ばれる。retryPendingPurgesは
  // 途中失敗で後片付けが未完了のまま残った利用者を拾い直す(#345)。
  // 呼び出し元はindex.tsのscheduledハンドラ(日次Cron)。
  const accountDeletionService = createAccountDeletionService({
    userRepository,
    studentRepository,
    staffRepository,
    teacherRepository,
    gatheringGroupMemberRepository,
    notificationScheduleRepository,
    firebaseTokenRepository,
  });
  const studentService = createStudentService(
    studentRepository,
    classRoomRepository
  );
  const staffService = createStaffService(staffRepository);
  const teacherService = createTeacherService(
    teacherRepository,
    classRoomRepository
  );
  const eventService = createEventService(
    eventRepository,
    eventGatheringSettingsRepository,
    venueRepository
  );
  const classRoomService = createClassRoomService(
    classRoomRepository,
    teacherRepository
  );
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
  const notificationAudienceResolverService =
    createNotificationAudienceResolverService(
      notificationAudienceResolverRepository
    );
  const adminNotificationService = createAdminNotificationService(
    adminNotificationRepository
  );
  const adminNotificationManagementService =
    createAdminNotificationManagementService(
      adminNotificationManagementRepository,
      adminNotificationRepository
    );
  const adminNotificationCommandService = createAdminNotificationCommandService(
    adminNotificationCommandRepository
  );
  const mobileNotificationService = createMobileNotificationService(
    mobileNotificationRepository
  );
  const gatheringSpotService = createGatheringSpotService(
    gatheringSpotRepository
  );
  const venueService = createVenueService(venueRepository);
  const gatheringGroupMemberService = createGatheringGroupMemberService(
    gatheringGroupMemberRepository
  );
  const gatheringService = createGatheringService(gatheringRepository);
  const eventGatheringSettingsService = createEventGatheringSettingsService(
    eventRepository,
    gatheringSpotRepository,
    eventGatheringSettingsRepository
  );

  // Controllers
  const userStatusController = createUserStatusController(userStatusService);
  const studentController = createStudentController(studentService);
  const staffController = createStaffController(staffService);
  const teacherController = createTeacherController(teacherService);
  const eventController = createEventController(eventService);
  const classRoomController = createClassRoomController(classRoomService);
  const masterImportController =
    createMasterImportController(masterImportService);
  const firebaseTokenController =
    createFirebaseTokenController(firebaseTokenService);
  const notificationController = createNotificationController(fcmService);
  const adminNotificationController = createAdminNotificationController(
    adminNotificationService
  );
  const adminNotificationManagementController =
    createAdminNotificationManagementController(
      adminNotificationManagementService
    );
  const adminNotificationCommandController =
    createAdminNotificationCommandController(adminNotificationCommandService);
  const mobileNotificationController = createMobileNotificationController(
    mobileNotificationService
  );
  const gatheringSpotController =
    createGatheringSpotController(gatheringSpotService);
  const venueController = createVenueController(venueService);
  const gatheringGroupMemberController = createGatheringGroupMemberController(
    gatheringGroupMemberService
  );
  const gatheringController = createGatheringController(gatheringService);
  const eventGatheringSettingsController =
    createEventGatheringSettingsController(eventGatheringSettingsService);

  return {
    // requireAuth（ミドルウェア）が直接参照するため、リポジトリのまま公開する
    userStatusRepository,
    authService,
    userStatusController,
    accountDeletionService,
    authorizationService,
    studentService,
    studentController,
    staffController,
    teacherController,
    eventController,
    classRoomController,
    masterImportController,
    firebaseTokenController,
    notificationController,
    adminNotificationController,
    adminNotificationManagementController,
    adminNotificationCommandController,
    mobileNotificationController,
    scheduledNotificationService,
    notificationAudienceResolverService,
    gatheringSpotController,
    venueController,
    gatheringGroupMemberController,
    gatheringController,
    eventGatheringSettingsController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
