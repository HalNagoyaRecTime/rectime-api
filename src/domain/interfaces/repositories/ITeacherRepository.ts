import {
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
  TeacherCreateInput,
} from '../../entities/Teacher';

export interface NewTeacherInput {
  displayName: string;
}

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  findAll: (filter?: TeacherSearchFilter) => Promise<TeacherPage>;
  existsClassRooms: (classRoomIds: number[]) => Promise<boolean>;
  create: (
    input: NewTeacherInput | TeacherCreateInput
  ) => Promise<TeacherEntity>;
  createMany: (inputs: NewTeacherInput[]) => Promise<void>;
  update: (
    id: number,
    input: TeacherUpdateInput
  ) => Promise<TeacherEntity | null>;
  deactivate: (id: number) => Promise<boolean>;
  // アカウント削除(#265 PR4)専用。teachers行を物理削除する前に、
  // class_rooms.teacher_id(ON DELETE句を持たない外部キー)を先にNULL化
  // しないとFK制約違反になるため、同一メソッド内で両方を処理する。
  // 該当する教員が存在しない場合は何もせずfalseを返す(冪等)。
  deleteByUserId: (userId: number) => Promise<boolean>;
}
