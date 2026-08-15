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
  class_rooms: TeacherClassRoomEntity[];
}

export interface TeacherSearchFilter {
  teacherId?: number;
  userName?: string;
  classRoomId?: number;
  isLiveActive?: boolean;
  search?: string;
  sortBy?: 'teacherId' | 'displayName';
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
