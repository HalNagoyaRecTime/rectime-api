import {
  ClassRoomDTO,
  ClassRoomImportCommitResult,
  ClassRoomImportInput,
  ClassRoomImportValidationResult,
} from '../dto/ClassRoomDTO';

export interface IClassRoomService {
  getAllClassRooms: () => Promise<ClassRoomDTO[]>;
  validateClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportValidationResult>;
  commitClassRoomImport: (
    input: ClassRoomImportInput
  ) => Promise<ClassRoomImportCommitResult>;
}
