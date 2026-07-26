import { StaffEntity } from '../../entities/Staff';

export interface IStaffRepository {
  findById: (id: number) => Promise<StaffEntity | null>;
  findAll: () => Promise<StaffEntity[]>;
}
