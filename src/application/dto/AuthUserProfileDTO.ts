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
  attendance_number: number | null;
  teacher?: AuthTeacherDTO;
}
