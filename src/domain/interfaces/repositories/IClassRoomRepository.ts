import {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
  ClassRoomSearchFilter,
  ClassRoomUpdateInput,
} from '../../entities/ClassRoom';

export interface IClassRoomRepository {
  findAll: (filter?: ClassRoomSearchFilter) => Promise<ClassRoomPage>;
  findById: (id: number) => Promise<ClassRoomEntity | null>;
  findByCode: (classCode: string) => Promise<ClassRoomEntity | null>;
  findExistingClassRoomIds: (classRoomIds: number[]) => Promise<Set<number>>;
  findExistingClassCodes: (classCodes: string[]) => Promise<Set<string>>;
  create: (input: ClassRoomInput) => Promise<ClassRoomEntity>;
  createMany: (inputs: Omit<ClassRoomInput, 'teamId'>[]) => Promise<void>;
  update: (
    id: number,
    input: ClassRoomUpdateInput
  ) => Promise<ClassRoomEntity | null>;
  updateAndCleanupTeam: (
    id: number,
    input: ClassRoomUpdateInput,
    previousTeamId: number
  ) => Promise<ClassRoomEntity | null>;
  delete: (id: number) => Promise<boolean>;
  // 退会中の学生(退会したユーザーの学生情報)の所属は外してから削除する。
  deleteAndCleanupTeam: (id: number, teamId: number) => Promise<boolean>;
  teacherExists: (id: number) => Promise<boolean>;
  existsWithTeamId: (
    teamId: number,
    excludeClassRoomId?: number
  ) => Promise<boolean>;
  // 退会中の学生は数えない。
  hasStudents: (id: number) => Promise<boolean>;
}
