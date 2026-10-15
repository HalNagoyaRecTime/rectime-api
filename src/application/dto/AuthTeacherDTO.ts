export interface AuthTeacherDTO {
  teacher_id: number;
  class_rooms: {
    class_room_id: number;
    class_code: string;
    class_room_name: string;
  }[];
}
