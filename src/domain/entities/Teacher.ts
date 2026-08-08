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
  search?: string;
  classRoomId?: number;
  isLiveActive?: boolean;
  sortBy?: TeacherSortBy;
  sortOrder?: TeacherSortOrder;
  limit?: number;
  offset?: number;
}

export type TeacherSortBy = 'teacherId' | 'displayName';
export type TeacherSortOrder = 'asc' | 'desc';

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
