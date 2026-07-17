import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { staffs, users } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { StaffEntity } from '../../domain/entities/Staff';
import { IStaffRepository } from '../../domain/interfaces/repositories/IStaffRepository';

type StaffJoinRow = {
  staffs: typeof staffs.$inferSelect;
  users: typeof users.$inferSelect;
};

function toEntity(row: StaffJoinRow): StaffEntity {
  return {
    staff_id: row.staffs.id,
    user_id: row.users.id,
    user_name: row.users.userName,
    created_at: row.staffs.createdAt,
    updated_at: row.staffs.updatedAt,
  };
}

export function createStaffRepository(db: D1Database): IStaffRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<StaffEntity | null> {
      const result = await orm
        .select()
        .from(staffs)
        .innerJoin(users, eq(staffs.userId, users.id))
        .where(eq(staffs.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll(): Promise<StaffEntity[]> {
      const results = await orm
        .select()
        .from(staffs)
        .innerJoin(users, eq(staffs.userId, users.id))
        .all();

      return results.map(toEntity);
    },
  };
}
