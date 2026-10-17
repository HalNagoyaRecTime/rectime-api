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
  lockVersion: number;
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

export interface ClassRoomUpdateInput extends ClassRoomInput {
  // 取得時点の lockVersion。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expectedLockVersion?: number;
}

export interface ClassRoomSearchFilter {
  search?: string;
  sortBy?:
    'classRoomId' | 'classCode' | 'className' | 'teacherName' | 'studentCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
