import { StaffDTO } from '../dto/StaffDTO';

export interface IStaffService {
  getStaffById: (id: number) => Promise<StaffDTO>;
  getAllStaffs: () => Promise<StaffDTO[]>;
}
