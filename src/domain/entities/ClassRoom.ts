export interface ClassRoomTeacher {
  teacherId: number;
  userId: number;
  displayName: string;
}

export interface ClassRoomEntity {
  classRoomId: number;
  classCode: string;
  className: string;
  studentCount: number;
  teacher: ClassRoomTeacher | null;
  teamId: number;
}

export interface ClassRoomPage {
  items: ClassRoomEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassRoomInput {
  classCode: string;
  className: string;
  teacherId: number | null;
  teamId: number | null;
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
