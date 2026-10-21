import type { UserCategories } from '../../domain/auth/types';
import type { AuthTeacherDTO } from './AuthTeacherDTO';

export interface AuthProfileIdentityDTO {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
}

export interface AuthUserProfileDTO extends UserCategories {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  avatar_updated_at: string | null;
  student_id_number: string | null;
  class_code: string | null;
  class_room_name: string | null;
  class_room_id: number | null;
  team_id: number | null;
  attendance_number: number | null;
  // 学生メール形式(STUDENT_EMAIL_DOMAIN かつ nhs + 数字)なのに学生情報が見つからない場合にtrue。
  // 教員・職員など学生メール形式以外は常にfalse。
  student_profile_missing: boolean;
  teacher?: AuthTeacherDTO;
}
