import { ClassDTO, ClassPageDTO, ClassRequestDTO } from '../dto/ClassDTO';

export interface IClassService {
  getAllClassrooms: (limit: number, offset: number) => Promise<ClassPageDTO>;
  getClassById: (id: number) => Promise<ClassDTO>;
  createClass: (input: ClassRequestDTO) => Promise<ClassDTO>;
  updateClass: (id: number, input: ClassRequestDTO) => Promise<ClassDTO>;
  deleteClass: (id: number) => Promise<void>;
}
