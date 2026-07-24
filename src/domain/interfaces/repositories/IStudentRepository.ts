import { StudentEntity } from '../../entities/Student';
import { StudentWriteDTO } from '../../../application/dto/StudentDTO';
import { NewClassRoomInput } from './IClassRoomRepository';

export interface NewStudentWithClassCodeInput {
  displayName: string;
  classCode: string;
  attendanceNumber: number;
  studentIdNumber: string;
}

export interface BulkCreateStudentsInput {
  newClassRooms: NewClassRoomInput[];
  students: NewStudentWithClassCodeInput[];
}

export interface IStudentRepository {
  findById: (id: number) => Promise<StudentEntity | null>;
  findAll: (options: {
    limit: number;
    offset: number;
  }) => Promise<{ students: StudentEntity[]; total: number }>;
  findByStudentNum: (studentNum: string) => Promise<StudentEntity | null>;
  classRoomExists: (classRoomId: number) => Promise<boolean>;
  create: (student: StudentWriteDTO) => Promise<StudentEntity>;
  update: (
    id: number,
    student: StudentWriteDTO
  ) => Promise<StudentEntity | null>;
  createMany: (input: BulkCreateStudentsInput) => Promise<void>;
}
