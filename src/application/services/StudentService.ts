import {
  StudentDTO,
  StudentClassRoomAssignmentDTO,
  StudentManagementDTO,
  StudentImportCommitResult,
  StudentImportErrorReason,
  StudentImportInput,
  StudentImportRow,
  StudentImportRowError,
  StudentImportValidationResult,
  StudentPageDTO,
  StudentUpdateDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';
import type {
  StudentEntity,
  StudentSearchFilter,
  StudentUpdateInput,
  StudentWriteInput,
} from '../../domain/entities/Student';
import type { MasterImportExcludedRow } from '../../domain/entities/MasterImport';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IStudentService } from './IStudentService';

function toDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.studentId,
    user_id: student.userId,
    display_name: student.userName,
    class_room_id: student.classRoomId,
    class_code: student.classRoomCode,
    class_room_name: student.classRoomName,
    team_id: student.teamId,
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
    class_room:
      student.classRoomId === null ||
      student.classRoomCode === null ||
      student.classRoomName === null
        ? null
        : {
            class_room_id: student.classRoomId,
            class_code: student.classRoomCode,
            class_name: student.classRoomName,
          },
    updated_at: student.updatedAt,
    lock_version: student.lockVersion,
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

function toDomainUpdateInput(student: StudentUpdateDTO): StudentUpdateInput {
  return {
    ...toDomainWriteInput(student),
    expectedLockVersion: student.lock_version,
  };
}

async function inspectImportRows(
  rows: StudentImportRow[],
  studentRepository: IStudentRepository
): Promise<{
  errors: StudentImportRowError[];
  excluded: MasterImportExcludedRow[];
}> {
  const seenStudentNumbers = new Set<string>();
  const seenAssignments = new Set<string>();
  const fileDuplicateRowIndexes = new Set<number>();
  const errors: StudentImportRowError[] = [];
  const excluded: MasterImportExcludedRow[] = [];
  const numbersToCheck: string[] = [];
  const assignmentsToCheck: {
    classCode: string;
    attendanceNumber: number;
  }[] = [];

  const describeRow = (rowIndex: number, row: StudentImportRow) => ({
    row_index: rowIndex + 1,
    class_code: row.class_code,
    attendance_number: row.attendance_number,
    student_id_number: row.student_id_number,
    display_name: `${row.last_name}${row.first_name}`,
  });

  const pushError = (
    rowIndex: number,
    row: StudentImportRow,
    reason: StudentImportErrorReason
  ) => {
    errors.push({ ...describeRow(rowIndex, row), reason });
  };

  for (const [rowIndex, row] of rows.entries()) {
    const assignmentKey = `${row.class_code}\u0000${row.attendance_number}`;
    const hasDuplicateStudentNumber = seenStudentNumbers.has(
      row.student_id_number
    );
    const hasDuplicateAssignment = seenAssignments.has(assignmentKey);
    seenStudentNumbers.add(row.student_id_number);
    seenAssignments.add(assignmentKey);

    if (hasDuplicateStudentNumber) {
      fileDuplicateRowIndexes.add(rowIndex);
      pushError(rowIndex, row, 'student_id_number_duplicate_in_file');
      continue;
    }
    if (hasDuplicateAssignment) {
      fileDuplicateRowIndexes.add(rowIndex);
      pushError(rowIndex, row, 'attendance_number_duplicate_in_file');
      continue;
    }
    numbersToCheck.push(row.student_id_number);
    assignmentsToCheck.push({
      classCode: row.class_code,
      attendanceNumber: row.attendance_number,
    });
  }

  const [existingStudents, existingAssignments] = await Promise.all([
    studentRepository.findExistingStudentsByNumbers(numbersToCheck),
    studentRepository.findExistingClassRoomAttendanceNumbers(
      assignmentsToCheck
    ),
  ]);
  const existingAssignmentKeys = new Set(
    existingAssignments.map(
      assignment =>
        `${assignment.classCode}\u0000${assignment.attendanceNumber}`
    )
  );

  for (const [rowIndex, row] of rows.entries()) {
    if (fileDuplicateRowIndexes.has(rowIndex)) {
      continue;
    }
    const existing = existingStudents.get(row.student_id_number);
    if (existing) {
      excluded.push({
        ...describeRow(rowIndex, row),
        student_id: existing.studentId,
        user_id: existing.userId,
        reason: existing.isDeleted
          ? 'student_account_deleted'
          : existing.isLiveActive
            ? 'student_already_registered'
            : 'student_already_registered_inactive',
      });
      continue;
    }
    if (
      existingAssignmentKeys.has(
        `${row.class_code}\u0000${row.attendance_number}`
      )
    ) {
      pushError(rowIndex, row, 'attendance_number_duplicate_in_db');
    }
  }

  errors.sort((a, b) => a.row_index - b.row_index);
  return { errors, excluded };
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
        items: result.items.map(toManagementDTO),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      };
    },

    async createStudent(
      student: StudentWriteDTO
    ): Promise<StudentManagementDTO> {
      const input = toDomainWriteInput(student);
      await ensureClassRoomExists(input.classRoomId);
      await ensureStudentNumberAvailable(input.studentIdNumber);
      await ensureAttendanceNumberAvailable(
        input.classRoomId,
        input.attendanceNumber
      );
      return toManagementDTO(await studentRepository.create(input));
    },

    async updateStudent(
      id: number,
      student: StudentUpdateDTO
    ): Promise<StudentManagementDTO> {
      const input = toDomainUpdateInput(student);
      const existing = await studentRepository.findById(id);
      if (!existing) {
        throw new Error('Student not found');
      }
      // 取得時点から変わっていれば、他の確認より先に409にする。
      // 確認後に更新される競合は、update() 側の条件で0件更新になって検出する。
      if (
        input.expectedLockVersion !== undefined &&
        input.expectedLockVersion !== existing.lockVersion
      ) {
        throw new Error('Student update conflict');
      }

      await ensureClassRoomExists(input.classRoomId);
      const duplicate = await studentRepository.findByStudentNum(
        input.studentIdNumber
      );
      if (duplicate && duplicate.studentId !== id) {
        throw new Error('Student number already exists');
      }
      await ensureAttendanceNumberAvailable(
        input.classRoomId,
        input.attendanceNumber,
        id
      );

      const updated = await studentRepository.update(id, input);
      if (!updated) {
        // 版番号を条件にしていた場合、0件更新は削除か版番号の不一致のどちらか。
        if (
          input.expectedLockVersion !== undefined &&
          (await studentRepository.findById(id))
        ) {
          throw new Error('Student update conflict');
        }
        throw new Error('Student not found');
      }
      return toManagementDTO(updated);
    },

    async updateStudentClassRoom(
      id: number,
      assignment: StudentClassRoomAssignmentDTO
    ): Promise<StudentManagementDTO> {
      if (!(await studentRepository.findById(id))) {
        throw new Error('Student not found');
      }
      await ensureClassRoomExists(assignment.class_room_id);
      await ensureAttendanceNumberAvailable(
        assignment.class_room_id,
        assignment.attendance_number,
        id
      );

      const updated = await studentRepository.updateClassRoom(id, {
        classRoomId: assignment.class_room_id,
        attendanceNumber: assignment.attendance_number,
      });
      if (!updated) {
        throw new Error('Student not found');
      }
      return toManagementDTO(updated);
    },

    async validateStudentImport(
      input: StudentImportInput
    ): Promise<StudentImportValidationResult> {
      const { errors, excluded } = await inspectImportRows(
        input.rows,
        studentRepository
      );
      return {
        total: input.rows.length,
        success_count: input.rows.length - errors.length - excluded.length,
        error_count: errors.length,
        errors,
        excluded_count: excluded.length,
        excluded,
      };
    },

    async commitStudentImport(
      input: StudentImportInput
    ): Promise<StudentImportCommitResult> {
      const { errors, excluded } = await inspectImportRows(
        input.rows,
        studentRepository
      );
      if (errors.length > 0) {
        return {
          total: input.rows.length,
          imported: 0,
          error_count: errors.length,
          errors,
          excluded,
        };
      }

      const excludedRowIndexes = new Set(
        excluded.map(row => row.row_index - 1)
      );
      const rowsToImport = input.rows.filter(
        (_, rowIndex) => !excludedRowIndexes.has(rowIndex)
      );
      const uniqueClassCodes = Array.from(
        new Set(rowsToImport.map(row => row.class_code))
      );
      const existingClassCodes =
        await classRoomRepository.findExistingClassCodes(uniqueClassCodes);
      const newClassRooms = uniqueClassCodes
        .filter(classCode => !existingClassCodes.has(classCode))
        .map(classCode => ({ classCode, className: classCode }));

      await studentRepository.createMany({
        newClassRooms,
        students: rowsToImport.map(row => ({
          displayName: `${row.last_name}${row.first_name}`,
          classCode: row.class_code,
          attendanceNumber: row.attendance_number,
          studentIdNumber: row.student_id_number,
        })),
      });

      return {
        total: input.rows.length,
        imported: rowsToImport.length,
        error_count: 0,
        errors: [],
        excluded,
      };
    },
  };

  async function ensureClassRoomExists(
    classRoomId: number | null
  ): Promise<void> {
    if (classRoomId === null) {
      return;
    }
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

  async function ensureAttendanceNumberAvailable(
    classRoomId: number | null,
    attendanceNumber: number | null,
    currentStudentId?: number
  ): Promise<void> {
    if (classRoomId === null || attendanceNumber === null) {
      return;
    }
    const occupied = await studentRepository.findByClassRoomAndAttendanceNumber(
      classRoomId,
      attendanceNumber
    );
    if (occupied && occupied.studentId !== currentStudentId) {
      throw new Error('Attendance number already exists');
    }
  }
}
