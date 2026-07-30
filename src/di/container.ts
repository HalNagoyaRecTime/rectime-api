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
import { createStudentService } from '../application/services/StudentService';
import { createStaffService } from '../application/services/StaffService';
import { createTeacherService } from '../application/services/TeacherService';
import { createEventService } from '../application/services/EventService';
import { createEventScheduleService } from '../application/services/EventScheduleService';
import { createClassRoomService } from '../application/services/ClassRoomService';
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
import { createStudentController } from '../presentation/controllers/StudentController';
import { createStaffController } from '../presentation/controllers/StaffController';
import { createTeacherController } from '../presentation/controllers/TeacherController';
import { createEventController } from '../presentation/controllers/EventController';
import { createEventScheduleController } from '../presentation/controllers/EventScheduleController';
import { createClassRoomController } from '../presentation/controllers/ClassRoomController';
import { createFirebaseTokenController } from '../presentation/controllers/FirebaseTokenController';
import { createNotificationController } from '../presentation/controllers/NotificationController';
import { createAdminNotificationController } from '../presentation/controllers/AdminNotificationController';
import { createAdminNotificationManagementController } from '../presentation/controllers/AdminNotificationManagementController';
import { createNotificationScheduleController } from '../presentation/controllers/NotificationScheduleController';
import { createMobileNotificationController } from '../presentation/controllers/MobileNotificationController';
import { createGatheringSpotController } from '../presentation/controllers/GatheringSpotController';
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
  const gatheringGroupMemberRepository =
    createGatheringGroupMemberRepository(db);
  const gatheringRepository = createGatheringRepository(db);

  // Services
  const authService = createAuthService(userRepository, env.AUTH_KV);
  const studentService = createStudentService(studentRepository);
  const staffService = createStaffService(staffRepository);
  const teacherService = createTeacherService(teacherRepository);
  const eventService = createEventService(eventRepository);
  const eventScheduleService = createEventScheduleService({
    eventRepository,
    eventScheduleRepository,
    notificationScheduleRepository,
    userRepository,
  });
  const classRoomService = createClassRoomService(classRoomRepository);
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
    notificationScheduleRepository,
    userRepository
  );
  const notificationService = createNotificationService(notificationRepository);
  const adminNotificationService = createAdminNotificationService(
    adminNotificationRepository,
    userRepository
  );
  const adminNotificationManagementService =
    createAdminNotificationManagementService(
      adminNotificationManagementRepository,
      adminNotificationRepository,
      userRepository
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

  // Controllers
  const studentController = createStudentController(studentService);
  const staffController = createStaffController(staffService);
  const teacherController = createTeacherController(teacherService);
  const eventController = createEventController(eventService);
  const eventScheduleController =
    createEventScheduleController(eventScheduleService);
  const classRoomController = createClassRoomController(classRoomService);
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

  return {
    authService,
    studentController,
    staffController,
    teacherController,
    eventController,
    eventScheduleController,
    classRoomController,
    firebaseTokenController,
    notificationController,
    adminNotificationController,
    adminNotificationManagementController,
    notificationScheduleController,
    mobileNotificationController,
    scheduledNotificationService,
    gatheringSpotController,
    gatheringGroupMemberController,
    gatheringController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;
