import { EventEntity, EntryEntity, StudentDTO, ClassEntity } from './domains';

// Student Service Types
export interface StudentServiceFunctions {
  getStudentById: (id: number) => Promise<StudentDTO>;
  getAllStudents: () => Promise<StudentDTO[]>;
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

export interface ClassServiceFunctions {
  getAllClasses: () => Promise<ClassEntity[]>;
}
