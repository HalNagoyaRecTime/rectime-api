import {
  BulkImportSkippedRow,
  BulkImportSkipReason,
  BulkImportStudentsInput,
  BulkImportStudentsResult,
  CreateStudentInput,
  StudentDTO,
} from '../dto/StudentDTO';
import { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';
import { IStudentService } from './IStudentService';
import { ClassNotFoundError } from '../../domain/errors/ClassNotFoundError';
import { DuplicateStudentIdNumberError } from '../../domain/errors/DuplicateStudentIdNumberError';

function toStudentDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.student_id,
    user_name: student.user_name,
    class_room_id: student.class_room_id,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
  };
}

export function createStudentService(
  studentRepository: IStudentRepository,
  classRepository: IClassRepository
): IStudentService {
  return {
    async getStudentById(id: number): Promise<StudentDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      return toStudentDTO(student);
    },
    async getAllStudents() {
      const students = await studentRepository.findAll();
      if (!students) {
        throw new Error('Student not found');
      }
      return students.map(toStudentDTO);
    },
    async createStudent(input: CreateStudentInput): Promise<StudentDTO> {
      const classRoom = await classRepository.findById(input.class_room_id);
      if (!classRoom) {
        throw new ClassNotFoundError(input.class_room_id);
      }

      const existing = await studentRepository.findByStudentNum(
        input.student_id_number
      );
      if (existing) {
        throw new DuplicateStudentIdNumberError(input.student_id_number);
      }

      const student = await studentRepository.create({
        classRoomId: classRoom.f_class_room_id,
        userName: input.user_name,
        attendanceNumber: input.attendance_number,
        studentIdNumber: input.student_id_number,
      });

      return toStudentDTO(student);
    },

    async bulkImportStudents(
      input: BulkImportStudentsInput
    ): Promise<BulkImportStudentsResult> {
      const classRooms = await classRepository.findAll();
      const classRoomIdByCode = new Map(
        classRooms.map(room => [room.f_class_code, room.f_class_room_id])
      );

      const existingStudents = await studentRepository.findAll();
      const existingStudentIdNumbers = new Set(
        existingStudents.map(student => student.student_id_number)
      );
      const seenInFile = new Set<string>();

      const skipped: BulkImportSkippedRow[] = [];
      let imported = 0;

      for (const [rowIndex, row] of input.rows.entries()) {
        const userName = `${row.last_name}${row.first_name}`;
        const skip = (reason: BulkImportSkipReason) => {
          skipped.push({
            row_index: rowIndex,
            class_code: row.class_code,
            attendance_number: row.attendance_number,
            student_id_number: row.student_id_number,
            user_name: userName,
            reason,
          });
        };

        let classRoomId = classRoomIdByCode.get(row.class_code);
        if (classRoomId === undefined) {
          // クラス記号がclass_roomsに無い場合、クラス名の情報はファイルに無いため
          // class_codeをそのままクラス名として仮登録する。後から手動で正しい名前に直す想定。
          const createdClassRoom = await classRepository.create({
            classCode: row.class_code,
            name: row.class_code,
          });
          classRoomId = createdClassRoom.f_class_room_id;
          classRoomIdByCode.set(row.class_code, classRoomId);
        }

        if (seenInFile.has(row.student_id_number)) {
          skip('student_id_number_duplicate_in_file');
          continue;
        }
        if (existingStudentIdNumbers.has(row.student_id_number)) {
          skip('student_id_number_duplicate_in_db');
          continue;
        }

        seenInFile.add(row.student_id_number);

        await studentRepository.create({
          classRoomId,
          userName,
          attendanceNumber: row.attendance_number,
          studentIdNumber: row.student_id_number,
        });
        existingStudentIdNumbers.add(row.student_id_number);
        imported++;
      }

      return { imported, skipped };
    },
  };
}
