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
  update: (
    id: number,
    student: StudentWriteDTO
  ) => Promise<StudentEntity | null>;
  createMany: (input: BulkCreateStudentsInput) => Promise<void>;
  // アカウント削除(#265 PR4)専用。student_id_numberはUNIQUE制約付きで、
  // 削除後の再登録(#265 PR1で「新規アカウントとして再登録を許容する」と
  // 確定済み)のため、行自体は残しつつプレースホルダ値(user_idを含む
  // 一意な値)へ書き換える。class_room_id・attendance_numberは学生本人の
  // 個人情報ではないため変更しない。該当する学生が存在しない場合は
  // 何もせずfalseを返す(冪等)。
  anonymizeByUserId: (userId: number) => Promise<boolean>;
}
