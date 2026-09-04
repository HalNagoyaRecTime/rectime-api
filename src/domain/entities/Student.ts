export interface StudentEntity {
  student_id: number;
  user_id: number;
  user_name: string;
  class_room_id: number;
  class_room_code?: string;
  class_room_name: string;
  attendance_number: number;
  student_id_number: string;
  is_live_active: boolean;
  is_staff: boolean;
}

export interface StudentSearchFilter {
  search?: string;
  classRoomId?: number;
  isStaff?: boolean;
  isLiveActive?: boolean;
  sortBy?:
    | 'studentId'
    | 'studentIdNumber'
    | 'displayName'
    | 'classCode'
    | 'className'
    | 'attendanceNumber';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
