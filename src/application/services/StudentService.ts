import {
  StudentDTO,
  StudentManagementDTO,
  StudentImportCommitResult,
  StudentImportErrorReason,
  StudentImportInput,
  StudentImportRow,
  StudentImportRowError,
  StudentImportValidationResult,
  StudentPageDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';
import type {
  StudentEntity,
  StudentSearchFilter,
  StudentWriteInput,
} from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IStudentService } from './IStudentService';

function toDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.studentId,
    user_id: student.userId,
    display_name: student.userName,
    class_room_id: student.classRoomId,
    class_room_name: student.classRoomName,
    attendance_number: student.attendanceNumber,
    student_id_number: student.studentIdNumber,
    is_live_active: student.isLiveActive,
  };
}

function toManagementDTO(student: StudentEntity): StudentManagementDTO {
  return {
    student_id: student.studentId,
    user_id: student.userId,
    display_name: student.userName,
    student_id_number: student.studentIdNumber,
    attendance_number: student.attendanceNumber,
    is_live_active: student.isLiveActive,
    is_staff: student.isStaff,
    class_room: {
      class_room_id: student.classRoomId,
      class_code: student.classRoomCode,
      class_name: student.classRoomName,
    },
  };
}

function toDomainWriteInput(student: StudentWriteDTO): StudentWriteInput {
  return {
    displayName: student.display_name,
    classRoomId: student.class_room_id,
    attendanceNumber: student.attendance_number,
    studentIdNumber: student.student_id_number,
  };
}

async function findImportErrors(
  rows: StudentImportRow[],
  studentRepository: IStudentRepository
): Promise<StudentImportRowError[]> {
  const seenInFile = new Set<string>();
  const fileDuplicateRowIndexes = new Set<number>();
  const errors: StudentImportRowError[] = [];
  const numbersToCheck: string[] = [];

  const pushError = (
    rowIndex: number,
    row: StudentImportRow,
    reason: StudentImportErrorReason
  ) => {
    errors.push({
      row_index: rowIndex + 1,
      class_code: row.class_code,
      attendance_number: row.attendance_number,
      student_id_number: row.student_id_number,
      display_name: `${row.last_name}${row.first_name}`,
      reason,
    });
  };

  for (const [rowIndex, row] of rows.entries()) {
    if (seenInFile.has(row.student_id_number)) {
      fileDuplicateRowIndexes.add(rowIndex);
      pushError(rowIndex, row, 'student_id_number_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.student_id_number);
    numbersToCheck.push(row.student_id_number);
  }

  const existingNumbers =
    await studentRepository.findExistingStudentNumbers(numbersToCheck);

  for (const [rowIndex, row] of rows.entries()) {
    if (fileDuplicateRowIndexes.has(rowIndex)) {
      continue;
    }
    if (existingNumbers.has(row.student_id_number)) {
      pushError(rowIndex, row, 'student_id_number_duplicate_in_db');
    }
  }

  errors.sort((a, b) => a.row_index - b.row_index);
  return errors;
}

export function createStudentService(
  studentRepository: IStudentRepository,
  classRoomRepository: IClassRoomRepository
): IStudentService {
  return {
    async getStudentById(id: number): Promise<StudentManagementDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      return toManagementDTO(student);
    },
    async getByUserId(userId: number): Promise<StudentDTO> {
      const student = await studentRepository.findByUserId(userId);
      if (!student) {
        throw new Error('Student not found');
      }

      return toDTO(student);
    },
    async getAllStudents(
      options: StudentSearchFilter
    ): Promise<StudentPageDTO> {
      const result = await studentRepository.findAll(options);
      return {
        items: result.students.map(toManagementDTO),
        total: result.total,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      };
    },

    async createStudent(
      student: StudentWriteDTO
    ): Promise<StudentManagementDTO> {
      const input = toDomainWriteInput(student);
      await ensureClassRoomExists(input.classRoomId);
      await ensureStudentNumberAvailable(input.studentIdNumber);
      return toManagementDTO(await studentRepository.create(input));
    },

    async updateStudent(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentManagementDTO> {
      const input = toDomainWriteInput(student);
      const existing = await studentRepository.findById(id);
      if (!existing) {
        throw new Error('Student not found');
      }

      await ensureClassRoomExists(input.classRoomId);
      const duplicate = await studentRepository.findByStudentNum(
        input.studentIdNumber
      );
      if (duplicate && duplicate.studentId !== id) {
        throw new Error('Student number already exists');
      }

      const updated = await studentRepository.update(id, input);
      if (!updated) {
        throw new Error('Student not found');
      }
      return toManagementDTO(updated);
    },

    async validateStudentImport(
      input: StudentImportInput
    ): Promise<StudentImportValidationResult> {
      const errors = await findImportErrors(input.rows, studentRepository);
      return {
        total: input.rows.length,
        success_count: input.rows.length - errors.length,
        error_count: errors.length,
        errors,
      };
    },

    async commitStudentImport(
      input: StudentImportInput
    ): Promise<StudentImportCommitResult> {
      const errors = await findImportErrors(input.rows, studentRepository);
      if (errors.length > 0) {
        return {
          total: input.rows.length,
          imported: 0,
          error_count: errors.length,
          errors,
        };
      }

      const uniqueClassCodes = Array.from(
        new Set(input.rows.map(row => row.class_code))
      );
      const existingClassCodes =
        await classRoomRepository.findExistingClassCodes(uniqueClassCodes);
      const newClassRooms = uniqueClassCodes
        .filter(classCode => !existingClassCodes.has(classCode))
        .map(classCode => ({ classCode, className: classCode }));

      await studentRepository.createMany({
        newClassRooms,
        students: input.rows.map(row => ({
          displayName: `${row.last_name}${row.first_name}`,
          classCode: row.class_code,
          attendanceNumber: row.attendance_number,
          studentIdNumber: row.student_id_number,
        })),
      });

      return {
        total: input.rows.length,
        imported: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },
  };

  async function ensureClassRoomExists(classRoomId: number): Promise<void> {
    if (!(await classRoomRepository.findById(classRoomId))) {
      throw new Error('Class room not found');
    }
  }

  async function ensureStudentNumberAvailable(
    studentNumber: string
  ): Promise<void> {
    if (await studentRepository.findByStudentNum(studentNumber)) {
      throw new Error('Student number already exists');
    }
  }
}
