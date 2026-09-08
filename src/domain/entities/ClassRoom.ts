export interface ClassRoomTeacher {
  teacherId: number;
  userId: number;
  displayName: string;
  teacher_id: number;
  user_id: number;
  display_name: string;
}

export interface ClassRoomEntity {
  classRoomId: number;
  classCode: string;
  className: string;
  studentCount: number;
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassRoomTeacher | null;
}

export interface ClassRoomPage {
  items: ClassRoomEntity[];
  classrooms: ClassRoomEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassRoomInput {
  classCode?: string;
  className?: string;
  teacherId?: number | null;
  class_code: string;
  class_name: string;
  teacher_id: number | null;
}

export interface ClassRoomSearchFilter {
  search?: string;
  sortBy?:
    | 'classRoomId'
    | 'classCode'
    | 'className'
    | 'teacherName'
    | 'studentCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
