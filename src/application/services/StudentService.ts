import {
  BulkImportSkippedRow,
  BulkImportSkipReason,
  BulkImportStudentsInput,
  BulkImportStudentsResult,
  StudentDTO,
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

    async bulkImportStudents(
      input: BulkImportStudentsInput
    ): Promise<BulkImportStudentsResult> {
      const classRooms = await classRoomRepository.findAll();
      const classRoomIdByCode = new Map(
        classRooms.map(room => [room.class_code, room.class_room_id])
      );

      const seenInFile = new Set<string>();
      const skipped: BulkImportSkippedRow[] = [];
      let imported = 0;

      for (const [rowIndex, row] of input.rows.entries()) {
        const displayName = `${row.last_name}${row.first_name}`;
        const skip = (reason: BulkImportSkipReason) => {
          skipped.push({
            row_index: rowIndex,
            class_code: row.class_code,
            attendance_number: row.attendance_number,
            student_id_number: row.student_id_number,
            display_name: displayName,
            reason,
          });
        };

        let classRoomId = classRoomIdByCode.get(row.class_code);
        if (classRoomId === undefined) {
          // クラス記号がclass_roomsに無い場合、クラス名の情報はファイルに無いため
          // class_codeをそのままクラス名として仮登録する。後から手動で正しい名前に直す想定。
          const createdClassRoom = await classRoomRepository.create({
            classCode: row.class_code,
            name: row.class_code,
          });
          classRoomId = createdClassRoom.class_room_id;
          classRoomIdByCode.set(row.class_code, classRoomId);
        }

        if (seenInFile.has(row.student_id_number)) {
          skip('student_id_number_duplicate_in_file');
          continue;
        }

        const existing = await studentRepository.findByStudentNum(
          row.student_id_number
        );
        if (existing) {
          skip('student_id_number_duplicate_in_db');
          continue;
        }

        seenInFile.add(row.student_id_number);

        await studentRepository.create({
          display_name: displayName,
          class_room_id: classRoomId,
          attendance_number: row.attendance_number,
          student_id_number: row.student_id_number,
        });
        imported++;
      }

      return { imported, skipped };
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
