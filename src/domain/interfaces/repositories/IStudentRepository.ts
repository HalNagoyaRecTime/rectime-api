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
  findExistingStudentNumbers: (
    studentNumbers: string[]
  ) => Promise<Set<string>>;
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
  // アカウント削除(#265 PR4)専用。student_id_numberはUNIQUE制約付きで、
  // 削除後の再登録(#265 PR1で「新規アカウントとして再登録を許容する」と
  // 確定済み)のため、行自体は残しつつプレースホルダ値(user_idを含む
  // 一意な値)へ書き換える。退会後の再登録で出席番号を再利用できるよう、
  // class_room_id・attendance_numberは両方NULLにする。該当する学生が
  // 存在しない場合は何もせずfalseを返す(冪等)。
  anonymizeByUserId: (userId: number) => Promise<boolean>;
}
