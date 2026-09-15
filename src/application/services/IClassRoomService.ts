import {
  ClassRoomDTO,
  ClassRoomImportCommitResult,
  ClassRoomImportInput,
  ClassRoomImportValidationResult,
  ClassRoomPageDTO,
  ClassRoomRequestDTO,
} from '../dto/ClassRoomDTO';

export interface IClassRoomService {
  getAllClassrooms: (
    limit: number,
    offset: number
  ) => Promise<ClassRoomPageDTO>;
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
