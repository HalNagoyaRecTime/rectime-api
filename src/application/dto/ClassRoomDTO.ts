import type { ClassRoomTeacher } from '../../domain/entities/ClassRoom';

export interface ClassRoomDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassRoomTeacher | null;
}

export interface ClassRoomPageDTO {
  classrooms: ClassRoomDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassRoomRequestDTO {
  class_code: string;
  class_name: string;
  teacher_id: number | null;
}
