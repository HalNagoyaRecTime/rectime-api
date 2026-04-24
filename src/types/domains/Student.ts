export interface StudentEntity {
  f_student_id: number;
  f_student_num: string;
  f_class: string;
  f_number: string;
  f_name: string;
  f_note: string | null;
}

export interface StudentDTO {
  f_student_id: string;
  f_student_num: string;
  f_class: string;
  f_number: string;
  f_name: string;
  f_note?: string;
}
