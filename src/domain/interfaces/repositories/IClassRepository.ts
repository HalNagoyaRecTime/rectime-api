import { ClassEntity } from '../../entities/Class';

export interface NewClassInput {
  classCode: string;
  name: string;
}

export interface IClassRepository {
  findAll: () => Promise<ClassEntity[]>;
  findById: (id: number) => Promise<ClassEntity | null>;
  create: (input: NewClassInput) => Promise<ClassEntity>;
}
