export interface StudentEntity {
  studentId: number;
  userId: number;
  userName: string;
  classRoomId: number;
  classRoomCode: string;
  classRoomName: string;
  attendanceNumber: number;
  studentIdNumber: string;
  isLiveActive: boolean;
  isStaff: boolean;
  updatedAt: string;
}

export interface StudentPage {
  items: StudentEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface StudentWriteInput {
  displayName: string;
  classRoomId: number;
  attendanceNumber: number;
  studentIdNumber: string;
}

export interface StudentUpdateInput extends StudentWriteInput {
  // 取得時点の updatedAt。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expectedUpdatedAt?: string;
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
    | 'attendanceNumber'
    | 'isStaff'
    | 'isLiveActive';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
