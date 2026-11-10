import type {
  StudentEntity,
  StudentClassRoomAssignment,
  StudentPage,
  StudentSearchFilter,
  StudentUpdateInput,
  StudentWriteInput,
} from '../../entities/Student';

export interface NewStudentWithClassCodeInput {
  displayName: string;
  classCode: string;
  attendanceNumber: number;
  studentIdNumber: string;
}

export interface StudentClassRoomAttendanceNumber {
  classCode: string;
  attendanceNumber: number;
}

export interface ExistingStudent {
  studentId: number;
  userId: number;
  isLiveActive: boolean;
  isDeleted: boolean;
}

export interface BulkCreateStudentsInput {
  newClassRooms: { classCode: string; className: string }[];
  students: NewStudentWithClassCodeInput[];
}

export interface IStudentRepository {
  findById: (id: number) => Promise<StudentEntity | null>;
  findByUserId: (userId: number) => Promise<StudentEntity | null>;
  findAll: (options: StudentSearchFilter) => Promise<StudentPage>;
  findByStudentNum: (studentNum: string) => Promise<StudentEntity | null>;
  findByClassRoomAndAttendanceNumber: (
    classRoomId: number,
    attendanceNumber: number
  ) => Promise<StudentEntity | null>;
  findExistingStudentsByNumbers: (
    studentNumbers: string[]
  ) => Promise<Map<string, ExistingStudent>>;
  findExistingClassRoomAttendanceNumbers: (
    assignments: StudentClassRoomAttendanceNumber[]
  ) => Promise<StudentClassRoomAttendanceNumber[]>;
  create: (student: StudentWriteInput) => Promise<StudentEntity>;
  update: (
    id: number,
    student: StudentUpdateInput
  ) => Promise<StudentEntity | null>;
  updateClassRoom: (
    id: number,
    assignment: StudentClassRoomAssignment
  ) => Promise<StudentEntity | null>;
  createMany: (input: BulkCreateStudentsInput) => Promise<void>;
}
