export interface TeacherClassRoomEntity {
  classRoomId: number;
  classCode: string;
  className: string;
}

export interface TeacherEntity {
  teacherId: number;
  userId: number;
  userName: string;
  isLiveActive: boolean;
  isStaff: boolean;
  classRooms: TeacherClassRoomEntity[];
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
  classRoomIds: number[];
}

export interface TeacherCreateInput {
  userName: string;
  classRoomIds: number[];
}
