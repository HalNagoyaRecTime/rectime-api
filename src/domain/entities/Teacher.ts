export interface TeacherClassRoomEntity {
  classRoomId: number;
  classCode: string;
  className: string;
}

export interface TeacherEntity {
  teacherId: number;
  userId: number;
  userName: string;
  email: string;
  isLiveActive: boolean;
  isStaff: boolean;
  classRooms: TeacherClassRoomEntity[];
  updatedAt: string;
}

export interface TeacherSearchFilter {
  search?: string;
  classRoomId?: number;
  isStaff?: boolean;
  isLiveActive?: boolean;
  sortBy?:
    | 'teacherId'
    | 'displayName'
    | 'classCode'
    | 'className'
    | 'isStaff'
    | 'isLiveActive';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TeacherPage {
  items: TeacherEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface TeacherUpdateInput {
  userName: string;
  email: string;
  classRoomIds: number[];
  // 取得時点の updatedAt。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expectedUpdatedAt?: string;
}

export interface TeacherCreateInput {
  userName: string;
  email: string;
  classRoomIds: number[];
}
