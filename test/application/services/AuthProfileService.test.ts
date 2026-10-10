import { describe, expect, it, vi } from 'vitest';
import { createAuthProfileService } from '../../../src/application/services/AuthProfileService';
import { ACCOUNT_PHOTO_PATH } from '../../../src/domain/auth/types';
import type { StudentEntity } from '../../../src/domain/entities/Student';
import type { TeacherEntity } from '../../../src/domain/entities/Teacher';

const identity = { id: '12', email: 'test@example.com', display_name: '本人' };
const student: StudentEntity = {
  studentId: 5,
  userId: 12,
  userName: '学生',
  classRoomId: 3,
  classRoomCode: '1-A',
  classRoomName: '1年A組',
  attendanceNumber: 7,
  studentIdNumber: '00123',
  isLiveActive: true,
  isStaff: false,
};
const teacher: TeacherEntity = {
  teacherId: 9,
  userId: 12,
  userName: '教師',
  email: identity.email,
  isLiveActive: true,
  isStaff: false,
  classRooms: [
    { classRoomId: 7, classCode: '2-B', className: '2年B組' },
    { classRoomId: 3, classCode: '1-A', className: '1年A組' },
  ],
};

function buildService() {
  const getUserCategories = vi.fn().mockResolvedValue({
    is_student: false,
    is_staff: false,
    is_teacher: false,
  });
  const findStudent = vi.fn().mockResolvedValue(null);
  const findTeacher = vi.fn().mockResolvedValue(null);
  return {
    getUserCategories,
    findStudent,
    findTeacher,
    service: createAuthProfileService(
      { getUserCategories },
      { findByUserId: findStudent },
      { findByUserId: findTeacher }
    ),
  };
}

describe('AuthProfileService', () => {
  it('一般ユーザーは既存のnull項目と写真の既定値を返す', async () => {
    const { service, findTeacher } = buildService();
    expect(await service.getProfile(identity)).toEqual({
      ...identity,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: null,
      student_id_number: null,
      class_code: null,
      class_room_name: null,
      attendance_number: null,
      is_student: false,
      is_staff: false,
      is_teacher: false,
    });
    expect(findTeacher).not.toHaveBeenCalled();
  });

  it('本人の学生情報を取得し、指定された写真情報を保持する', async () => {
    const { service, findStudent, getUserCategories } = buildService();
    findStudent.mockResolvedValue(student);
    getUserCategories.mockResolvedValue({
      is_student: true,
      is_staff: false,
      is_teacher: false,
    });
    const profile = await service.getProfile({
      ...identity,
      avatar_url: 'https://example.com/avatar.png',
      avatar_updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(profile).toMatchObject({
      student_id_number: '00123',
      class_code: '1-A',
      class_room_name: '1年A組',
      attendance_number: 7,
      avatar_url: 'https://example.com/avatar.png',
      avatar_updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(findStudent).toHaveBeenCalledWith(12);
    expect(getUserCategories).toHaveBeenCalledWith(12);
  });

  it('種別の併存を保持し、本人の担当クラスをコード順で返す', async () => {
    const { service, findStudent, findTeacher, getUserCategories } =
      buildService();
    findStudent.mockResolvedValue(student);
    findTeacher.mockResolvedValue(teacher);
    getUserCategories.mockResolvedValue({
      is_student: true,
      is_staff: true,
      is_teacher: true,
    });
    expect(await service.getProfile(identity)).toMatchObject({
      is_student: true,
      is_staff: true,
      is_teacher: true,
      student_id_number: '00123',
      teacher: {
        teacher_id: 9,
        class_rooms: [
          { class_room_id: 3, class_code: '1-A', class_room_name: '1年A組' },
          { class_room_id: 7, class_code: '2-B', class_room_name: '2年B組' },
        ],
      },
    });
    expect(findTeacher).toHaveBeenCalledWith(12);
  });

  it('担当なしの教師は空配列を返す', async () => {
    const { service, findTeacher, getUserCategories } = buildService();
    findTeacher.mockResolvedValue({ ...teacher, classRooms: [] });
    getUserCategories.mockResolvedValue({
      is_student: false,
      is_staff: false,
      is_teacher: true,
    });
    expect(await service.getProfile(identity)).toMatchObject({
      teacher: { teacher_id: 9, class_rooms: [] },
    });
  });

  it('教師情報が取得時点でなくなっていたらteacherを省略する', async () => {
    const { service, getUserCategories } = buildService();
    getUserCategories.mockResolvedValue({
      is_student: false,
      is_staff: false,
      is_teacher: true,
    });
    expect(await service.getProfile(identity)).not.toHaveProperty('teacher');
  });

  it('DB障害を情報なしとして握りつぶさない', async () => {
    const { service, findStudent } = buildService();
    const error = new Error('DB unavailable');
    findStudent.mockRejectedValue(error);
    await expect(service.getProfile(identity)).rejects.toBe(error);
  });
});
