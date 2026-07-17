import { StaffDTO } from '../dto/StaffDTO';
import type { StaffEntity } from '../../domain/entities/Staff';
import { IStaffRepository } from '../../domain/interfaces/repositories/IStaffRepository';
import { IStaffService } from './IStaffService';

function toDTO(staff: StaffEntity): StaffDTO {
  return {
    staff_id: staff.staff_id,
    user_id: staff.user_id,
    display_name: staff.user_name,
  };
}

export function createStaffService(
  staffRepository: IStaffRepository
): IStaffService {
  return {
    async getStaffById(id: number): Promise<StaffDTO> {
      const staff = await staffRepository.findById(id);
      if (!staff) {
        throw new Error('Staff not found');
      }
      return toDTO(staff);
    },
    async getAllStaffs(): Promise<StaffDTO[]> {
      const staffs = await staffRepository.findAll();
      if (!staffs) {
        throw new Error('Staff not found');
      }
      return staffs.map(toDTO);
    },
  };
}
