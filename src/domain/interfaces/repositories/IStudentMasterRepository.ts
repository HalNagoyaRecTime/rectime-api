import {
  NewStudentMasterRow,
  StudentMasterEntity,
} from '../../entities/StudentMaster';

export interface IStudentMasterRepository {
  findAll: () => Promise<StudentMasterEntity[]>;
  bulkCreate: (rows: NewStudentMasterRow[]) => Promise<StudentMasterEntity[]>;
}
