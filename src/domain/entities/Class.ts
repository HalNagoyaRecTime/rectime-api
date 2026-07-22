export interface ClassTeacher {
  teacher_id: number;
  user_id: number;
  display_name: string;
}

export interface ClassEntity {
  class_room_id: number;
  class_code: string;
  name: string;
  student_count: number;
  teacher: ClassTeacher | null;
}

export interface ClassPage {
  classes: ClassEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface ClassInput {
  class_code: string;
  name: string;
  teacher_id: number | null;
}
