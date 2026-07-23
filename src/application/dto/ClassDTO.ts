import type { ClassTeacher } from '../../domain/entities/Class';

export interface ClassDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassTeacher | null;
}

export interface ClassPageDTO {
  classrooms: ClassDTO[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ClassRequestDTO {
  class_code: string;
  class_name: string;
  teacher_id: number | null;
}
