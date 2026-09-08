import {
  ClassRoomDTO,
  ClassRoomImportCommitResult,
  ClassRoomImportInput,
  ClassRoomImportValidationResult,
  ClassRoomPageDTO,
  ClassRoomRequestDTO,
} from '../dto/ClassRoomDTO';
import type { ClassRoomSearchFilter } from '../../domain/entities/ClassRoom';

export interface IClassRoomService {
  getAllClassrooms: {
    (filter?: ClassRoomSearchFilter): Promise<ClassRoomPageDTO>;
    (limit: number, offset: number): Promise<ClassRoomPageDTO>;
  };
  getClassroomById: (id: number) => Promise<ClassRoomDTO>;
  createClassroom: (input: ClassRoomRequestDTO) => Promise<ClassRoomDTO>;
  updateClassroom: (
    id: number,
    input: ClassRoomRequestDTO
  ) => Promise<ClassRoomDTO>;
  deleteClassroom: (id: number) => Promise<void>;
  validateClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportValidationResult>;
  commitClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportCommitResult>;
}
