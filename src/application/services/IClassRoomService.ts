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
  getAllClassRooms: (
    filter?: ClassRoomSearchFilter
  ) => Promise<ClassRoomPageDTO>;
  getClassRoomById: (id: number) => Promise<ClassRoomDTO>;
  createClassRoom: (input: ClassRoomRequestDTO) => Promise<ClassRoomDTO>;
  updateClassRoom: (
    id: number,
    input: ClassRoomRequestDTO
  ) => Promise<ClassRoomDTO>;
  deleteClassRoom: (id: number) => Promise<void>;
  validateClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportValidationResult>;
  commitClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportCommitResult>;
}
