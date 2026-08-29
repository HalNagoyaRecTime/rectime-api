export interface ClassRoomTeacher {
  teacher_id: number;
  user_id: number;
  display_name: string;
}

export interface ClassRoomEntity {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassRoomTeacher | null;
  team_id: number;
}

export interface ClassRoomPage {
  classrooms: ClassRoomEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassRoomInput {
  class_code: string;
  class_name: string;
  teacher_id: number | null;
  team_id: number | null;
}
