import { ClassEntity } from '../../entities/Class';

export interface IClassRepository {
  findAll: () => Promise<ClassEntity[]>;
  findById: (id: number) => Promise<ClassEntity | null>;
}
