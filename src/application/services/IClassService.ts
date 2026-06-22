import { ClassDTO } from '../dto/ClassDTO';

export interface IClassService {
  getAllClasses: () => Promise<ClassDTO[]>;
}
