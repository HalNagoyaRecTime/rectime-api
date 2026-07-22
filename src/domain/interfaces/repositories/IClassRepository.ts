import { ClassEntity, ClassInput, ClassPage } from '../../entities/Class';

export interface IClassRepository {
  findAll: (page: number, limit: number) => Promise<ClassPage>;
  findById: (id: number) => Promise<ClassEntity | null>;
  create: (input: ClassInput) => Promise<ClassEntity>;
  update: (id: number, input: ClassInput) => Promise<ClassEntity | null>;
  delete: (id: number) => Promise<boolean>;
  teacherExists: (id: number) => Promise<boolean>;
  hasStudents: (id: number) => Promise<boolean>;
}
