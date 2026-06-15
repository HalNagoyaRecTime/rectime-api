import {
  EventEntity,
  EntryEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
  StudentEntity,
} from './domains';

// Student Service Types
export interface StudentServiceFunctions {
  getStudentById: (id: number) => Promise<StudentEntity>;
  getAllStudents: () => Promise<StudentEntity[]>;
}

export interface EventServiceFunctions {
  getAllEvents: (options: {
    f_event_code?: string;
    f_time?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  getEventById: (id: number) => Promise<EventEntity>;
}

export interface EntryServiceFunctions {
  getAllEntries: (options: {
    f_student_id?: number;
    f_event_id?: number;
    limit?: number;
    offset?: number;
  }) => Promise<{ entries: EntryEntity[]; total: number }>;
  getEntryById: (id: number) => Promise<EntryEntity>;
}

export interface FcmTestNotificationInput {
  title: string;
  body: string;
}

export interface FcmNotificationInput {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmTestNotificationResult {
  success: true;
  messageId: string;
}

export interface FcmServiceFunctions {
  sendTestNotification: (
    input: FcmTestNotificationInput
  ) => Promise<FcmTestNotificationResult>;
  sendNotificationToToken: (
    input: FcmNotificationInput
  ) => Promise<FcmTestNotificationResult>;
}

export interface FirebaseTokenServiceFunctions {
  registerFirebaseToken: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
}
