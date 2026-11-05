import { ACCOUNT_PHOTO_PATH } from '../../domain/auth/types';
import { isStudentEmail } from '../../domain/auth/email';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import type { IAuthProfileService } from './IAuthProfileService';

export function createAuthProfileService(
  userRepository: Pick<IUserRepository, 'getUserCategories'>,
  studentRepository: Pick<IStudentRepository, 'findByUserId'>,
  teacherRepository: Pick<ITeacherRepository, 'findByUserId'>,
  studentEmailDomain: string
): IAuthProfileService {
  return {
    async getProfile(identity) {
      const userId = Number(identity.id);
      const [student, categories] = await Promise.all([
        studentRepository.findByUserId(userId),
        userRepository.getUserCategories(userId),
      ]);
      const teacher = categories.is_teacher
        ? await teacherRepository.findByUserId(userId)
        : null;

      return {
        id: identity.id,
        email: identity.email,
        display_name: identity.display_name,
        avatar_url: identity.avatar_url ?? ACCOUNT_PHOTO_PATH,
        avatar_updated_at: identity.avatar_updated_at ?? null,
        student_id_number: student?.studentIdNumber ?? null,
        class_code: student?.classRoomCode ?? null,
        class_room_name: student?.classRoomName ?? null,
        class_room_id: student?.classRoomId ?? null,
        team_id: student?.teamId ?? null,
        attendance_number: student?.attendanceNumber ?? null,
        // 学生メールでログインしたのに学生情報がひも付いていない(学生登録漏れ)状態。
        // 学生メール形式以外(教員・職員など)は常にfalse。
        student_profile_missing:
          !student && isStudentEmail(identity.email, studentEmailDomain),
        ...categories,
        ...(teacher
          ? {
              teacher: {
                teacher_id: teacher.teacherId,
                class_rooms: teacher.classRooms
                  .map(room => ({
                    class_room_id: room.classRoomId,
                    class_code: room.classCode,
                    class_room_name: room.className,
                  }))
                  .sort(
                    (a, b) =>
                      a.class_code.localeCompare(b.class_code) ||
                      a.class_room_id - b.class_room_id
                  ),
              },
            }
          : {}),
      };
    },
  };
}
