export interface TeacherClassRoomEntity {
  class_room_id: number;
  class_code: string;
  class_name: string;
}

export interface TeacherEntity {
  teacher_id: number;
  user_id: number;
  user_name: string;
  is_live_active: boolean;
  is_staff?: boolean;
  class_rooms: TeacherClassRoomEntity[];
}

export interface TeacherSearchFilter {
  teacherId?: number;
  userName?: string;
  search?: string;
  classRoomId?: number;
  isStaff?: boolean;
  isLiveActive?: boolean;
  sortBy?: 'teacherId' | 'displayName' | 'classCode' | 'className';
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
