import { TeacherEntity } from '../../entities/Teacher';

export interface NewTeacherInput {
  displayName: string;
}

export interface ITeacherRepository {
  create: (input: NewTeacherInput) => Promise<TeacherEntity>;
  createMany: (inputs: NewTeacherInput[]) => Promise<TeacherEntity[]>;
}
