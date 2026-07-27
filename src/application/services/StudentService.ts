import {
  StudentDTO,
  StudentImportCommitResult,
  StudentImportErrorReason,
  StudentImportInput,
  StudentImportRow,
  StudentImportRowError,
  StudentImportValidationResult,
  StudentPageDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';
import type { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IStudentService } from './IStudentService';

function toDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.student_id,
    display_name: student.user_name,
    class_room_id: student.class_room_id,
    class_room_name: student.class_room_name,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
    is_live_active: student.is_live_active,
  };
}

async function findImportErrors(
  rows: StudentImportRow[],
  studentRepository: IStudentRepository
): Promise<StudentImportRowError[]> {
  const seenInFile = new Set<string>();
  const errors: StudentImportRowError[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const displayName = `${row.last_name}${row.first_name}`;
    const pushError = (reason: StudentImportErrorReason) => {
      errors.push({
        row_index: rowIndex,
        class_code: row.class_code,
        attendance_number: row.attendance_number,
        student_id_number: row.student_id_number,
        display_name: displayName,
        reason,
      });
    };

    if (seenInFile.has(row.student_id_number)) {
      pushError('student_id_number_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.student_id_number);

    const existing = await studentRepository.findByStudentNum(
      row.student_id_number
    );
    if (existing) {
      pushError('student_id_number_duplicate_in_db');
    }
  }

  return errors;
}

export function createStudentService(
  studentRepository: IStudentRepository,
  classRoomRepository: IClassRoomRepository
): IStudentService {
  return {
    async getStudentById(id: number): Promise<StudentDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      return toDTO(student);
    },
    async getAllStudents({
      limit,
      offset,
    }: {
      limit: number;
      offset: number;
    }): Promise<StudentPageDTO> {
      const result = await studentRepository.findAll({ limit, offset });
      return {
        students: result.students.map(toDTO),
        total: result.total,
        limit,
        offset,
      };
    },

    async createStudent(student: StudentWriteDTO): Promise<StudentDTO> {
      await ensureClassRoomExists(student.class_room_id);
      await ensureStudentNumberAvailable(student.student_id_number);
      return toDTO(await studentRepository.create(student));
    },

    async updateStudent(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentDTO> {
      const existing = await studentRepository.findById(id);
      if (!existing) {
        throw new Error('Student not found');
      }

      await ensureClassRoomExists(student.class_room_id);
      const duplicate = await studentRepository.findByStudentNum(
        student.student_id_number
      );
      if (duplicate && duplicate.student_id !== id) {
        throw new Error('Student number already exists');
      }

      const updated = await studentRepository.update(id, student);
      if (!updated) {
        throw new Error('Student not found');
      }
      return toDTO(updated);
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

      const newClassRooms: { classCode: string; className: string }[] = [];
      const seenCodes = new Set<string>();
      for (const row of input.rows) {
        if (seenCodes.has(row.class_code)) {
          continue;
        }
        seenCodes.add(row.class_code);
        if (!(await classRoomRepository.findByCode(row.class_code))) {
          newClassRooms.push({
            classCode: row.class_code,
            className: row.class_code,
          });
        }
      }

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
    if (!(await studentRepository.classRoomExists(classRoomId))) {
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
