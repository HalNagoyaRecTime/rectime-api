import { isValidEventDate } from '../lib/eventDate';
import { getDb } from '../lib/db';
import { createNotificationStopRepository } from '../infrastructure/repositories/NotificationStopRepository';
import { createNotificationStopService } from '../application/services/NotificationStopService';
import { createNotificationStopController } from '../presentation/controllers/NotificationStopController';
import { createNotificationRetryService } from '../application/services/NotificationRetryService';
import { createNotificationScheduleActionRepository } from '../infrastructure/repositories/NotificationScheduleActionRepository';
import { createNotificationScheduleActionService } from '../application/services/NotificationScheduleActionService';
import { createNotificationScheduleActionController } from '../presentation/controllers/NotificationScheduleActionController';
import { createNotificationScheduleQueryRepository } from '../infrastructure/repositories/NotificationScheduleQueryRepository';
import { createNotificationScheduleQueryService } from '../application/services/NotificationScheduleQueryService';
import { createNotificationScheduleQueryController } from '../presentation/controllers/NotificationScheduleQueryController';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createStaffRepository } from '../infrastructure/repositories/StaffRepository';
import { createTeacherRepository } from '../infrastructure/repositories/TeacherRepository';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createClassRoomRepository } from '../infrastructure/repositories/ClassRoomRepository';
import { createTeamRepository } from '../infrastructure/repositories/TeamRepository';
import { createFirebaseTokenRepository } from '../infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationScheduleRepository } from '../infrastructure/repositories/NotificationScheduleRepository';
import { createNotificationResultQueryRepository } from '../infrastructure/repositories/NotificationResultQueryRepository';
import { createNotificationAccountDeletionRepository } from '../infrastructure/repositories/NotificationAccountDeletionRepository';
import { createAdminNotificationRepository } from '../infrastructure/repositories/AdminNotificationRepository';
import { createAdminNotificationCommandRepository } from '../infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationCreationRepository } from '../infrastructure/repositories/NotificationCreationRepository';
import { createGatheringNotificationGeneratorRepository } from '../infrastructure/repositories/GatheringNotificationGeneratorRepository';
import { createNotificationConfigRepository } from '../infrastructure/repositories/NotificationConfigRepository';
import { createAdminNotificationQueryRepository } from '../infrastructure/repositories/AdminNotificationQueryRepository';
import { createNotificationAudienceResolverRepository } from '../infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationDeliveryRepository } from '../infrastructure/repositories/NotificationDeliveryRepository';
import { createAdminNotificationManagementRepository } from '../infrastructure/repositories/AdminNotificationManagementRepository';
import { createMobileNotificationRepository } from '../infrastructure/repositories/MobileNotificationRepository';
import { createGatheringSpotRepository } from '../infrastructure/repositories/GatheringSpotRepository';
import { createVenueRepository } from '../infrastructure/repositories/VenueRepository';
import { createGatheringGroupMemberRepository } from '../infrastructure/repositories/GatheringGroupMemberRepository';
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
import { createNotificationResultQueryService } from '../application/services/NotificationResultQueryService';
import { createNotificationAudienceResolverService } from '../application/services/NotificationAudienceResolverService';
import { createNotificationDeliveryService } from '../application/services/NotificationDeliveryService';
import { createAdminNotificationManagementService } from '../application/services/AdminNotificationManagementService';
import { createAdminNotificationCommandService } from '../application/services/AdminNotificationCommandService';
import { createGatheringNotificationGeneratorService } from '../application/services/GatheringNotificationGeneratorService';
import { createGatheringNotificationCleanupService } from '../application/services/GatheringNotificationCleanupService';
import { createNotificationConfigService } from '../application/services/NotificationConfigService';
import { createAdminNotificationQueryService } from '../application/services/AdminNotificationQueryService';
import { createMobileNotificationService } from '../application/services/MobileNotificationService';
import { createGatheringSpotService } from '../application/services/GatheringSpotService';
import { createVenueService } from '../application/services/VenueService';
import { createGatheringGroupMemberService } from '../application/services/GatheringGroupMemberService';
import { createEventGatheringSettingsService } from '../application/services/EventGatheringSettingsService';
import { createRankingService } from '../application/services/RankingService';
import { createTeamService } from '../application/services/TeamService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createStaffController } from '../presentation/controllers/StaffController';
import { createTeacherController } from '../presentation/controllers/TeacherController';
import { createEventController } from '../presentation/controllers/EventController';
import { createClassRoomController } from '../presentation/controllers/ClassRoomController';
import { createMasterImportController } from '../presentation/controllers/MasterImportController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createAdminNotificationManagementController } from '../presentation/controllers/AdminNotificationManagementController';
import { createAdminNotificationCommandController } from '../presentation/controllers/AdminNotificationCommandController';
import { createAdminNotificationQueryController } from '../presentation/controllers/AdminNotificationQueryController';
import { createNotificationResultQueryController } from '../presentation/controllers/NotificationResultQueryController';
import { createNotificationConfigController } from '../presentation/controllers/NotificationConfigController';
import { createMobileNotificationController } from '../presentation/controllers/MobileNotificationController';
import { createGatheringSpotController } from '../presentation/controllers/GatheringSpotController';
import { createVenueController } from '../presentation/controllers/VenueController';
import { createPlaceImageController } from '../presentation/controllers/PlaceImageController';
import { createPlaceImageService } from '../application/services/PlaceImageService';
import { createR2ImageStorage } from '../infrastructure/storages/R2ImageStorage';
import { createR2ImageUrlSigner } from '../infrastructure/storages/R2ImageUrlSigner';
import { createPlaceImageKeyRepository } from '../infrastructure/repositories/PlaceImageKeyRepository';
import { createDeleteUnusedImage } from '../application/services/deleteUnusedImage';
import { createGatheringGroupMemberController } from '../presentation/controllers/GatheringGroupMemberController';
import { createEventGatheringSettingsController } from '../presentation/controllers/EventGatheringSettingsController';
import { createRankingController } from '../presentation/controllers/RankingController';
import { createTeamController } from '../presentation/controllers/TeamController';
import { createUserRepository } from '../infrastructure/repositories/UserRepository';
import { createUserStatusRepository } from '../infrastructure/repositories/UserStatusRepository';
import { createUserStatusService } from '../application/services/UserStatusService';
import { createUserStatusController } from '../presentation/controllers/UserStatusController';
import { createAuthProfileService } from '../application/services/AuthProfileService';
import { createAuthService } from '../application/services/authService';
import { createLogoutService } from '../application/services/LogoutService';
import { createKvRefreshSessionRepository } from '../infrastructure/repositories/KvRefreshSessionRepository';
import { createAccountDeletionService } from '../application/services/AccountDeletionService';
import { createNotificationAccountDeletionService } from '../application/services/NotificationAccountDeletionService';
import { createAuthorizationService } from '../application/services/AuthorizationService';
import type { Env } from '../lib/env';

export function createDIContainer(env: Env) {
  const imageUrlSigner = createR2ImageUrlSigner({
    bucketUrl: env.IMAGES_BUCKET_URL,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  const db = getDb(env);
  const notificationStopService = createNotificationStopService(
    createNotificationStopRepository(db)
  );
  const notificationStopController = createNotificationStopController(
    notificationStopService
  );
  const notificationScheduleActionController =
    createNotificationScheduleActionController(
      createNotificationScheduleActionService(
        createNotificationScheduleActionRepository(db)
      )
    );
  const notificationScheduleQueryController =
    createNotificationScheduleQueryController(
      createNotificationScheduleQueryService(
        createNotificationScheduleQueryRepository(db)
      )
    );

  // Repositories
  const userRepository = createUserRepository(db);
  const userStatusRepository = createUserStatusRepository(db);
  const studentRepository = createStudentRepository(db);
  const staffRepository = createStaffRepository(db);
  const teacherRepository = createTeacherRepository(db);
  const eventRepository = createEventRepository(db);
  const classRoomRepository = createClassRoomRepository(db);
  const teamRepository = createTeamRepository(db);
  const firebaseTokenRepository = createFirebaseTokenRepository(db);
  const notificationScheduleRepository =
    createNotificationScheduleRepository(db);
  const notificationResultQueryRepository =
    createNotificationResultQueryRepository(db);
  const notificationAccountDeletionRepository =
    createNotificationAccountDeletionRepository(db);
  const adminNotificationRepository = createAdminNotificationRepository(db);
  const adminNotificationManagementRepository =
    createAdminNotificationManagementRepository(db);
  const notificationCreationRepository =
    createNotificationCreationRepository(db);
  const adminNotificationCommandRepository =
    createAdminNotificationCommandRepository(
      db,
      notificationCreationRepository
    );
  const notificationConfigRepository = createNotificationConfigRepository(db);
  const adminNotificationQueryRepository =
    createAdminNotificationQueryRepository(db);
  const notificationAudienceResolverRepository =
    createNotificationAudienceResolverRepository(db);
  const notificationDeliveryRepository = createNotificationDeliveryRepository(
    db,
    { automaticDeliveryEnabled: isValidEventDate(env.EVENT_DATE) }
  );
  const mobileNotificationRepository = createMobileNotificationRepository(db);
  const gatheringSpotRepository = createGatheringSpotRepository(db);
  const venueRepository = createVenueRepository(db);
  const gatheringGroupMemberRepository =
    createGatheringGroupMemberRepository(db);
  const gatheringNotificationGeneratorRepository =
    createGatheringNotificationGeneratorRepository(db);
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
  const authProfileService = createAuthProfileService(
    userRepository,
    studentRepository,
    teacherRepository,
    env.STUDENT_EMAIL_DOMAIN
  );
  const logoutService = createLogoutService(
    firebaseTokenRepository,
    createKvRefreshSessionRepository(env.AUTH_KV)
  );
  const userStatusService = createUserStatusService(userStatusRepository);
  const authorizationService = createAuthorizationService(userRepository);
  // #265: 関連データの削除・匿名化(deleteRelatedData)は
  // DELETE /auth/me(account.ts)から呼ばれる。retryPendingPurgesは
  // 途中失敗で後片付けが未完了のまま残った利用者を拾い直す(#345)。
  // 呼び出し元はindex.tsのscheduledハンドラ(日次Cron)。
  const notificationAccountDeletionService =
    createNotificationAccountDeletionService({
      firebaseTokenRepository,
      notificationScheduleRepository,
      notificationAccountDeletionRepository,
    });
  const accountDeletionService = createAccountDeletionService({
    userRepository,
    studentRepository,
    staffRepository,
    teacherRepository,
    gatheringGroupMemberRepository,
    notificationAccountDeletionService,
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
    venueRepository,
    imageUrlSigner,
    env.EVENT_DATE
  );
  const classRoomService = createClassRoomService(
    classRoomRepository,
    teacherRepository,
    teamRepository
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
  });
  const scheduledNotificationService = createScheduledNotificationService({
    firebaseTokenRepository,
    notificationScheduleRepository,
    notificationDeliveryQueue,
    fcmService,
    ensureConfigured: fcmService.ensureConfigured,
  });
  const notificationAudienceResolverService =
    createNotificationAudienceResolverService(
      notificationAudienceResolverRepository
    );
  const notificationRetryService = createNotificationRetryService({
    notificationDeliveryQueue,
    notificationDeliveryRepository,
    firebaseTokenRepository,
    fcmService,
    ensureConfigured: fcmService.ensureConfigured,
  });
  const notificationDeliveryService = createNotificationDeliveryService({
    notificationRetryService,
    notificationDeliveryRepository,
    firebaseTokenRepository,
    notificationDeliveryQueue,
    fcmService,
    ensureConfigured: fcmService.ensureConfigured,
  });
  const adminNotificationManagementService =
    createAdminNotificationManagementService(
      adminNotificationManagementRepository,
      adminNotificationRepository
    );
  const adminNotificationQueryService = createAdminNotificationQueryService(
    adminNotificationQueryRepository
  );
  const notificationResultQueryService = createNotificationResultQueryService(
    notificationResultQueryRepository
  );
  const adminNotificationCommandService = createAdminNotificationCommandService(
    adminNotificationCommandRepository,
    adminNotificationQueryService
  );
  const gatheringNotificationGeneratorService =
    createGatheringNotificationGeneratorService(
      gatheringNotificationGeneratorRepository,
      notificationCreationRepository,
      env.EVENT_DATE
    );
  const gatheringNotificationCleanupService =
    createGatheringNotificationCleanupService(notificationStopService);
  const notificationConfigService = createNotificationConfigService(
    notificationConfigRepository
  );
  const mobileNotificationService = createMobileNotificationService(
    mobileNotificationRepository
  );
  const imageStorage = createR2ImageStorage(env.IMAGES);
  const deleteUnusedImage = createDeleteUnusedImage(
    imageStorage,
    createPlaceImageKeyRepository(db)
  );
  const gatheringSpotService = createGatheringSpotService(
    gatheringSpotRepository,
    deleteUnusedImage,
    imageUrlSigner
  );
  const venueService = createVenueService(
    venueRepository,
    deleteUnusedImage,
    imageUrlSigner
  );
  const placeImageService = createPlaceImageService(
    imageStorage,
    deleteUnusedImage,
    venueRepository,
    gatheringSpotRepository
  );
  const gatheringGroupMemberService = createGatheringGroupMemberService(
    gatheringGroupMemberRepository
  );
  const eventGatheringSettingsService = createEventGatheringSettingsService(
    eventRepository,
    gatheringSpotRepository,
    eventGatheringSettingsRepository,
    imageUrlSigner,
    gatheringNotificationGeneratorService,
    gatheringNotificationCleanupService
  );
  const rankingService = createRankingService(teamRepository);
  const teamService = createTeamService(teamRepository);

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
  const adminNotificationManagementController =
    createAdminNotificationManagementController(
      adminNotificationManagementService
    );
  const adminNotificationCommandController =
    createAdminNotificationCommandController(adminNotificationCommandService);
  const adminNotificationQueryController =
    createAdminNotificationQueryController(adminNotificationQueryService);
  const notificationResultQueryController =
    createNotificationResultQueryController(notificationResultQueryService);
  const notificationConfigController = createNotificationConfigController(
    notificationConfigService
  );
  const mobileNotificationController = createMobileNotificationController(
    mobileNotificationService
  );
  const gatheringSpotController =
    createGatheringSpotController(gatheringSpotService);
  const venueController = createVenueController(venueService);
  const placeImageController = createPlaceImageController(placeImageService);
  const gatheringGroupMemberController = createGatheringGroupMemberController(
    gatheringGroupMemberService
  );
  const eventGatheringSettingsController =
    createEventGatheringSettingsController(eventGatheringSettingsService);
  const rankingController = createRankingController(rankingService);
  const teamController = createTeamController(teamService);

  return {
    notificationStopService,
    notificationStopController,
    notificationScheduleActionController,
    notificationScheduleQueryController,
    // requireAuth（ミドルウェア）が直接参照するため、リポジトリのまま公開する
    userStatusRepository,
    authService,
    authProfileService,
    logoutService,
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
    adminNotificationManagementController,
    adminNotificationQueryService,
    adminNotificationCommandController,
    adminNotificationQueryController,
    notificationResultQueryController,
    notificationConfigController,
    mobileNotificationController,
    scheduledNotificationService,
    gatheringNotificationGeneratorService,
    notificationAudienceResolverService,
    notificationDeliveryService,
    notificationRetryService,
    gatheringSpotController,
    venueController,
    placeImageController,
    gatheringGroupMemberController,
    eventGatheringSettingsController,
    rankingController,
    teamController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
