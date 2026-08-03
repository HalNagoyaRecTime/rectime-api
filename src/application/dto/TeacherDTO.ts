export interface TeacherClassRoomDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
}

export interface TeacherDTO {
  teacher_id: number;
  user_id: number;
  display_name: string;
  is_live_active: boolean;
  class_rooms: TeacherClassRoomDTO[];
}

export interface TeacherPageDTO {
  items: TeacherDTO[];
  total: number;
  limit: number;
  offset: number;
}
