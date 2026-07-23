import {
  TeacherImportCommitResult,
  TeacherImportInput,
  TeacherImportValidationResult,
} from '../dto/TeacherDTO';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import { ITeacherService } from './ITeacherService';

export function createTeacherService(
  teacherRepository: ITeacherRepository
): ITeacherService {
  return {
    async validateTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportValidationResult> {
      return {
        total: input.rows.length,
        success_count: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },

    async commitTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportCommitResult> {
      for (const row of input.rows) {
        await teacherRepository.create({
          displayName: `${row.last_name}${row.first_name}`,
        });
      }

      return {
        total: input.rows.length,
        imported: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },
  };
}
