import {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
  ClassRoomSearchFilter,
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
    input: ClassRoomInput
  ) => Promise<ClassRoomEntity | null>;
  updateAndCleanupTeam: (
    id: number,
    input: ClassRoomInput,
    previousTeamId: number
  ) => Promise<ClassRoomEntity | null>;
  delete: (id: number) => Promise<boolean>;
  deleteAndCleanupTeam: (id: number, teamId: number) => Promise<boolean>;
  teacherExists: (id: number) => Promise<boolean>;
  existsWithTeamId: (
    teamId: number,
    excludeClassRoomId?: number
  ) => Promise<boolean>;
  hasStudents: (id: number) => Promise<boolean>;
}
