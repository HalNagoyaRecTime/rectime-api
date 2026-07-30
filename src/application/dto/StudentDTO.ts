export interface StudentDTO {
  student_id: number;
  display_name: string;
  class_room_id: number;
  class_room_name: string;
  attendance_number: number;
  student_id_number: string;
  is_live_active: boolean;
}

export interface StudentWriteDTO {
  display_name: string;
  class_room_id: number;
  attendance_number: number;
  student_id_number: string;
}

export interface StudentPageDTO {
  students: StudentDTO[];
  total: number;
  limit: number;
  offset: number;
}
