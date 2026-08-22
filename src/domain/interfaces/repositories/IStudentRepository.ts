import { StudentEntity } from '../../entities/Student';
import { StudentWriteDTO } from '../../../application/dto/StudentDTO';

export interface NewStudentWithClassCodeInput {
  displayName: string;
  classCode: string;
  attendanceNumber: number;
  studentIdNumber: string;
}

export interface BulkCreateStudentsInput {
  newClassRooms: { classCode: string; className: string }[];
  students: NewStudentWithClassCodeInput[];
}

export interface IStudentRepository {
  findById: (id: number) => Promise<StudentEntity | null>;
  findByUserId: (userId: number) => Promise<StudentEntity | null>;
  findAll: (options: {
    limit: number;
    offset: number;
  }) => Promise<{ students: StudentEntity[]; total: number }>;
  findByStudentNum: (studentNum: string) => Promise<StudentEntity | null>;
  findExistingStudentNumbers: (
    studentNumbers: string[]
  ) => Promise<Set<string>>;
  classRoomExists: (classRoomId: number) => Promise<boolean>;
  create: (student: StudentWriteDTO) => Promise<StudentEntity>;
  deactivate: (id: number) => Promise<boolean>;
  restore: (
    id: number,
    student: StudentWriteDTO
  ) => Promise<StudentEntity | null>;
  update: (
    id: number,
    student: StudentWriteDTO
  ) => Promise<StudentEntity | null>;
  createMany: (input: BulkCreateStudentsInput) => Promise<void>;
}
