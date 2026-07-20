import {
  ImportStudentMasterInput,
  ImportStudentMasterResult,
  StudentMasterRowInput,
} from '../dto/StudentMasterDTO';
import { IStudentMasterRepository } from '../../domain/interfaces/repositories/IStudentMasterRepository';
import { IStudentMasterService } from './IStudentMasterService';
import {
  StudentMasterDuplicate,
  StudentMasterDuplicateError,
  StudentMasterDuplicateReason,
} from '../../domain/errors/StudentMasterDuplicateError';

function classAttendanceKey(classCode: number, attendanceNumber: number) {
  return `${classCode}:${attendanceNumber}`;
}

function findDuplicates(
  rows: StudentMasterRowInput[],
  existingStudentIdNumbers: Set<number>,
  existingClassAttendanceKeys: Set<string>
): StudentMasterDuplicate[] {
  const rowIndexesByStudentIdNumber = new Map<number, number[]>();
  const rowIndexesByClassAttendance = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const studentIdNumberIndexes =
      rowIndexesByStudentIdNumber.get(row.student_id_number) ?? [];
    studentIdNumberIndexes.push(index);
    rowIndexesByStudentIdNumber.set(
      row.student_id_number,
      studentIdNumberIndexes
    );

    const key = classAttendanceKey(row.class_code, row.attendance_number);
    const classAttendanceIndexes = rowIndexesByClassAttendance.get(key) ?? [];
    classAttendanceIndexes.push(index);
    rowIndexesByClassAttendance.set(key, classAttendanceIndexes);
  });

  const reasonsByRowIndex = new Map<
    number,
    Set<StudentMasterDuplicateReason>
  >();
  const addReason = (
    rowIndex: number,
    reason: StudentMasterDuplicateReason
  ) => {
    const reasons = reasonsByRowIndex.get(rowIndex) ?? new Set();
    reasons.add(reason);
    reasonsByRowIndex.set(rowIndex, reasons);
  };

  for (const [studentIdNumber, indexes] of rowIndexesByStudentIdNumber) {
    if (indexes.length > 1) {
      indexes.forEach(rowIndex =>
        addReason(rowIndex, 'student_id_number_duplicate_in_file')
      );
    }
    if (existingStudentIdNumbers.has(studentIdNumber)) {
      indexes.forEach(rowIndex =>
        addReason(rowIndex, 'student_id_number_duplicate_in_db')
      );
    }
  }

  for (const [key, indexes] of rowIndexesByClassAttendance) {
    if (indexes.length > 1) {
      indexes.forEach(rowIndex =>
        addReason(rowIndex, 'class_attendance_duplicate_in_file')
      );
    }
    if (existingClassAttendanceKeys.has(key)) {
      indexes.forEach(rowIndex =>
        addReason(rowIndex, 'class_attendance_duplicate_in_db')
      );
    }
  }

  return Array.from(reasonsByRowIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([rowIndex, reasons]) => {
      const row = rows[rowIndex];
      return {
        rowIndex,
        classCode: row.class_code,
        attendanceNumber: row.attendance_number,
        studentIdNumber: row.student_id_number,
        userName: row.user_name,
        reasons: Array.from(reasons),
      };
    });
}

export function createStudentMasterService(
  studentMasterRepository: IStudentMasterRepository
): IStudentMasterService {
  return {
    async importStudentMaster(
      input: ImportStudentMasterInput
    ): Promise<ImportStudentMasterResult> {
      const existing = await studentMasterRepository.findAll();
      const existingStudentIdNumbers = new Set(
        existing.map(row => row.student_id_number)
      );
      const existingClassAttendanceKeys = new Set(
        existing.map(row =>
          classAttendanceKey(row.class_code, row.attendance_number)
        )
      );

      const duplicates = findDuplicates(
        input.rows,
        existingStudentIdNumbers,
        existingClassAttendanceKeys
      );

      if (duplicates.length > 0) {
        throw new StudentMasterDuplicateError(duplicates);
      }

      const created = await studentMasterRepository.bulkCreate(
        input.rows.map(row => ({
          classCode: row.class_code,
          attendanceNumber: row.attendance_number,
          studentIdNumber: row.student_id_number,
          userName: row.user_name,
        }))
      );

      return { imported: created.length };
    },
  };
}
