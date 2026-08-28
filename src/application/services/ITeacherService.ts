import {
  TeacherDTO,
  TeacherImportCommitResult,
  TeacherImportInput,
  TeacherImportValidationResult,
  TeacherPageDTO,
} from '../dto/TeacherDTO';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';

export interface TeacherCreateRequest {
  userName: string;
  classRoomIds: number[];
}

export interface TeacherUpdateRequest {
  userName: string;
  classRoomIds: number[];
}

export interface ITeacherService {
  createTeacher: (input: TeacherCreateRequest) => Promise<TeacherDTO>;
  getTeacherById: (id: number) => Promise<TeacherDTO>;
  getAllTeachers: (filter?: TeacherSearchFilter) => Promise<TeacherPageDTO>;
  updateTeacher: (
    id: number,
    input: TeacherUpdateRequest
  ) => Promise<TeacherDTO>;
  deleteTeacher: (id: number) => Promise<void>;
  validateTeacherImport: (
    input: TeacherImportInput
  ) => Promise<TeacherImportValidationResult>;
  commitTeacherImport: (
    input: TeacherImportInput
  ) => Promise<TeacherImportCommitResult>;
}
