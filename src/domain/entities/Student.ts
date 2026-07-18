export interface StudentEntity {
  student_id: number;
  user_id: number;
  user_name: string;
  class_room_id: number;
  attendance_number: number;
  student_id_number: string;
}

export interface NewStudentInput {
  classRoomId: number;
  userName: string;
  attendanceNumber: number;
  studentIdNumber: string;
}
