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
  updatedAt: string;
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
}

export interface ClassRoomUpdateInput extends ClassRoomInput {
  // 取得時点の updatedAt。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expectedUpdatedAt?: string;
}

export interface ClassRoomSearchFilter {
  search?: string;
  sortBy?:
    'classRoomId' | 'classCode' | 'className' | 'teacherName' | 'studentCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
