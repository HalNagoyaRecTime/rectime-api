import {
  ClassRoomDTO,
  ClassRoomImportCommitResult,
  ClassRoomImportErrorReason,
  ClassRoomImportInput,
  ClassRoomImportRow,
  ClassRoomImportRowError,
  ClassRoomImportValidationResult,
} from '../dto/ClassRoomDTO';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IClassRoomService } from './IClassRoomService';

async function findImportErrors(
  rows: ClassRoomImportRow[],
  classRoomRepository: IClassRoomRepository
): Promise<ClassRoomImportRowError[]> {
  const existingClassRooms = await classRoomRepository.findAll();
  const existingCodes = new Set(
    existingClassRooms.map(room => room.class_code)
  );

  const seenInFile = new Set<string>();
  const errors: ClassRoomImportRowError[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const pushError = (reason: ClassRoomImportErrorReason) => {
      errors.push({
        row_index: rowIndex,
        class_code: row.class_code,
        class_name: row.class_name,
        reason,
      });
    };

    if (seenInFile.has(row.class_code)) {
      pushError('class_code_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.class_code);

    if (existingCodes.has(row.class_code)) {
      pushError('class_code_duplicate_in_db');
    }
  }

  return errors;
}

export function createClassRoomService(
  classRoomRepository: IClassRoomRepository
): IClassRoomService {
  return {
    async getAllClassRooms(): Promise<ClassRoomDTO[]> {
      const classRooms = await classRoomRepository.findAll();
      return classRooms.map(classroom => ({
        class_room_id: classroom.class_room_id,
        class_code: classroom.class_code,
        class_name: classroom.class_name,
      }));
    },

    async validateClassRoomImport(
      input: ClassRoomImportInput
    ): Promise<ClassRoomImportValidationResult> {
      const errors = await findImportErrors(input.rows, classRoomRepository);
      return {
        total: input.rows.length,
        success_count: input.rows.length - errors.length,
        error_count: errors.length,
        errors,
      };
    },

    async commitClassRoomImport(
      input: ClassRoomImportInput
    ): Promise<ClassRoomImportCommitResult> {
      const errors = await findImportErrors(input.rows, classRoomRepository);
      if (errors.length > 0) {
        return {
          total: input.rows.length,
          imported: 0,
          error_count: errors.length,
          errors,
        };
      }

      await classRoomRepository.createMany(
        input.rows.map(row => ({
          classCode: row.class_code,
          name: row.class_name,
        }))
      );

      return {
        total: input.rows.length,
        imported: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },
  };
}
