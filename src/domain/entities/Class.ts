export interface ClassTeacher {
  teacher_id: number;
  user_id: number;
  display_name: string;
}

export interface ClassEntity {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassTeacher | null;
}

export interface ClassPage {
  classrooms: ClassEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassInput {
  class_code: string;
  class_name: string;
  teacher_id: number | null;
}
