import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../../../src/application/services/authService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { AppUser } from '../../../src/domain/auth/types';
import type { MicrosoftClaims } from '../../../src/application/services/IAuthService';

function buildClaims(
  overrides: Partial<MicrosoftClaims> = {}
): MicrosoftClaims {
  return {
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    name: '田中太郎',
    preferred_username: 'tanaka@example.com',
    ...overrides,
  };
}

function buildAppUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'user-1',
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
    ...overrides,
  };
}

describe('createAuthService', () => {
  function setup() {
    const userRepository: IUserRepository = {
      exists: vi.fn(),
      isStaffOrTeacher: vi.fn(),
      isStaff: vi.fn(),
      getUserCategories: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      getDeletionStatus: vi.fn().mockResolvedValue('active'),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
      linkMicrosoftAccount: vi.fn(),
    };
    const studentRepository: IStudentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByStudentNum: vi.fn(),
      classRoomExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findExistingStudentNumbers: vi.fn(),
      createMany: vi.fn(),
      findByUserId: vi.fn(),
    };
    const studentEmailDomain = 'nhs.hal.ac.jp';
    const service = createAuthService(
      userRepository,
      studentRepository,
      studentEmailDomain
    );
    return { userRepository, studentRepository, service };
  }

  it('studentEmailDomainが未設定の場合はエラーを投げる', () => {
    const userRepository: IUserRepository = {
      exists: vi.fn(),
      isStaffOrTeacher: vi.fn(),
      isStaff: vi.fn(),
      getUserCategories: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      getDeletionStatus: vi.fn().mockResolvedValue('active'),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
      linkMicrosoftAccount: vi.fn(),
    };
    const studentRepository: IStudentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByStudentNum: vi.fn(),
      classRoomExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findExistingStudentNumbers: vi.fn(),
      createMany: vi.fn(),
      findByUserId: vi.fn(),
    };

    expect(() =>
      createAuthService(userRepository, studentRepository, '')
    ).toThrow('STUDENT_EMAIL_DOMAIN is not configured');
  });

  describe('upsertUser', () => {
    it('既存ユーザーが見つかる場合は updateUser を呼び出す', async () => {
      const { userRepository, service } = setup();
      const claims = buildClaims();
      const updated = buildAppUser();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated
      );

      const result = await service.upsertUser(claims);

      expect(userRepository.updateUser).toHaveBeenCalledWith({
        userId: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });
      expect(result).toEqual(updated);
    });

    it('既存ユーザーのdeletion_statusがdeletion_pendingの場合はACCOUNT_DELETION_PENDINGを投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (
        userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('deletion_pending');

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'ACCOUNT_DELETION_PENDING'
      );
      expect(userRepository.updateUser).not.toHaveBeenCalled();
    });

    it('既存ユーザーのdeletion_statusがdeletedの場合はACCOUNT_DELETION_PENDINGを投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (
        userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('deleted');

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'ACCOUNT_DELETION_PENDING'
      );
      expect(userRepository.updateUser).not.toHaveBeenCalled();
    });

    it('既存ユーザーが見つかるが update が null を返す場合は USER_NOT_FOUND を投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'USER_NOT_FOUND'
      );
    });

    it('既存ユーザーがいない場合は createUserWithMicrosoftLink を呼び出す', async () => {
      const { userRepository, service } = setup();
      const created = buildAppUser();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(created);

      const result = await service.upsertUser(buildClaims());

      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalledWith({
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });
      expect(result).toEqual(created);
    });

    it('preferred_username も email も無い場合は空文字メールと name をそのまま使う', async () => {
      const { userRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: undefined,
        email: undefined,
        name: '山田花子',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: '', displayName: '山田花子' })
      );
    });

    it('create 時に microsoft_account_links の UNIQUE 制約違反が発生した場合、再取得して update する', async () => {
      const { userRepository, service } = setup();
      const raced = buildAppUser();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('user-raced');
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error(
          'UNIQUE constraint failed: microsoft_account_links.oid, microsoft_account_links.tid'
        )
      );
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        raced
      );

      const result = await service.upsertUser(buildClaims());

      expect(userRepository.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-raced' })
      );
      expect(result).toEqual(raced);
    });

    it('create 時に無関係のエラーが発生した場合はそのまま投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('some other db error'));

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'some other db error'
      );
    });

    it('競合後の再取得でユーザーが見つからない場合は CREATE_USER_FAILED を投げる', async () => {
      const { userRepository, service } = setup();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: microsoft_account_links.oid')
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'CREATE_USER_FAILED'
      );
    });

    it('競合後の update が null を返す場合は CREATE_USER_FAILED を投げる', async () => {
      const { userRepository, service } = setup();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('user-raced');
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: microsoft_account_links.oid')
      );
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'CREATE_USER_FAILED'
      );
    });

    it('oid/tidで見つからないが学籍番号で既存の学生が見つかる場合、linkMicrosoftAccountを呼び学生情報を返す', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs50000@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        student_id: 1,
        user_id: 100,
        user_name: '田中太郎',
        class_room_id: 1,
        class_room_name: '3年A組',
        attendance_number: 5,
        student_id_number: '50000',
        is_live_active: true,
      });

      const result = await service.upsertUser(claims);

      expect(studentRepository.findByStudentNum).toHaveBeenCalledWith('50000');
      expect(userRepository.linkMicrosoftAccount).toHaveBeenCalledWith({
        userId: '100',
        oid: 'oid-1',
        tid: 'tid-1',
      });
      expect(userRepository.createUserWithMicrosoftLink).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: '100',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'nhs50000@nhs.hal.ac.jp',
        display_name: '田中太郎',
      });
    });

    it('メールドメインが学生用ドメインと一致しない場合、学籍番号として扱わない', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs50000@gmail.com',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(studentRepository.findByStudentNum).not.toHaveBeenCalled();
      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalled();
    });

    it('メールアドレスがnhsで始まらない場合、学籍番号として扱わない', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'tanaka2024@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(studentRepository.findByStudentNum).not.toHaveBeenCalled();
      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalled();
    });

    it('メールに学籍番号(数字)が含まれない場合、従来通りcreateUserWithMicrosoftLinkに進む', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'tanaka@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(studentRepository.findByStudentNum).not.toHaveBeenCalled();
      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalled();
    });

    it('学籍番号の形式は正しいがDBに該当する学生がいない場合、従来通り新規作成に進む', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs99999@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(studentRepository.findByStudentNum).toHaveBeenCalledWith('99999');
      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalled();
    });

    it('学籍番号で紐付く場合、display_nameはclaims.nameではなくstudent.user_nameになる', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        name: 'Microsoft側の名前',
        preferred_username: 'nhs50000@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        student_id: 1,
        user_id: 100,
        user_name: '学生登録時の名前',
        class_room_id: 1,
        class_room_name: '3年A組',
        attendance_number: 5,
        student_id_number: '50000',
        is_live_active: true,
      });

      const result = await service.upsertUser(claims);

      expect(result.display_name).toBe('学生登録時の名前');
    });

    it('学籍番号紐付け時にuser_idが重複した場合、STUDENT_ALREADY_LINKEDを投げる', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs50000@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        student_id: 1,
        user_id: 100,
        user_name: '田中太郎',
        class_room_id: 1,
        class_room_name: '3年A組',
        attendance_number: 5,
        student_id_number: '50000',
        is_live_active: true,
      });
      (
        userRepository.linkMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: microsoft_account_links.user_id')
      );

      await expect(service.upsertUser(claims)).rejects.toThrow(
        'STUDENT_ALREADY_LINKED'
      );
    });

    it('学籍番号紐付け時にoid/tidが重複した場合、usersは更新せず既存の学生情報を返す', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs50000@nhs.hal.ac.jp',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        student_id: 1,
        user_id: 100,
        user_name: '田中太郎',
        class_room_id: 1,
        class_room_name: '3年A組',
        attendance_number: 5,
        student_id_number: '50000',
        is_live_active: true,
      });
      (
        userRepository.linkMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error(
          'UNIQUE constraint failed: microsoft_account_links.oid, microsoft_account_links.tid'
        )
      );
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce('100');

      const result = await service.upsertUser(claims);

      expect(userRepository.updateUser).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: '100',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'nhs50000@nhs.hal.ac.jp',
        display_name: '田中太郎',
      });
    });
  });
});
