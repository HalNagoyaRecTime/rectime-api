import {
  EventEntity,
  EntryEntity,
  StudentEntity,
  ClassEntity,
} from './domains';

// Student Repository Types
export interface StudentRepositoryFunctions {
  findById: (id: number) => Promise<StudentEntity | null>;
  findAll: () => Promise<StudentEntity[]>;
  findByStudentNum: (studentNum: string) => Promise<StudentEntity | null>;
}

// Event Repository Types
export interface EventRepositoryFunctions {
  findAll: (options: {
    f_event_code?: string;
    f_time?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  findByIdWithEntryCount: (id: number) => Promise<EventEntity | null>;
  findById: (id: number) => Promise<EventEntity | null>;
  findByEventCode: (eventCode: string) => Promise<EventEntity | null>;
}

// Entry Repository Types
export interface EntryRepositoryFunctions {
  findAll: (options: {
    f_student_id?: number;
    f_event_id?: number;
    limit?: number;
    offset?: number;
  }) => Promise<{ entries: EntryEntity[]; total: number }>;
  findById: (id: number) => Promise<EntryEntity | null>;
}

// Class Repository Types
export interface ClassRepositoryFunctions {
  findAll: () => Promise<ClassEntity[]>;
}
