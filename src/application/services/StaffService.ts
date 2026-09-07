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
  // 退会済みUserへ権限を付け外ししないための共通の入口。
  async function ensureUserExists(userId: number): Promise<void> {
    if (!(await staffRepository.existsActiveUser(userId))) {
      throw new Error('User not found');
    }
  }

  return {
    async getStaffById(id: number): Promise<StaffDTO> {
      const staff = await staffRepository.findById(id);
      if (!staff) {
        throw new Error('Staff not found');
      }

      return toDTO(staff);
    },
    async getAllStaffs() {
      const staffs = await staffRepository.findAll();
      return staffs.map(toDTO);
    },
    async assignStaffRole(userId: number): Promise<void> {
      await ensureUserExists(userId);
      await staffRepository.addByUserId(userId);
    },
    async revokeStaffRole(command): Promise<void> {
      // 自分自身の解除は断る。解除した瞬間にこのAPIを含む管理系の操作が
      // できなくなり、他のstaffに戻してもらうまで自力では復旧できないため。
      if (command.operator_user_id === command.user_id) {
        throw new Error('Cannot revoke your own staff role');
      }

      // 対象がstaffでなくても成功として扱う。呼び出し側が求めているのは
      // 「staffでない状態」であり、それはすでに満たされているため。
      await ensureUserExists(command.user_id);
      await staffRepository.deleteByUserId(command.user_id);
    },
  };
}
