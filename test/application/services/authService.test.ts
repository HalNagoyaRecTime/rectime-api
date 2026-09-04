import { env as workerEnv } from 'cloudflare:workers';
import type { KVNamespace } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../../../src/application/services/authService';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { AppUser } from '../../../src/domain/auth/types';
import type { MicrosoftClaims } from '../../../src/application/services/IAuthService';

function buildFirebaseTokenRepository(): IFirebaseTokenRepository {
  return {
    register: vi.fn(),
    findActiveTokens: vi.fn(),
    deactivate: vi.fn(),
    deactivateByUserId: vi.fn(),
    findByUserId: vi.fn(),
    deleteByUserId: vi.fn(),
  };
}

function buildAuthKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
}

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
      isStaff: vi.fn(),
      getUserCategories: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      getDeletionStatus: vi.fn().mockResolvedValue('active'),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
      linkMicrosoftAccount: vi.fn(),
      markAsDeleted: vi.fn(),
      anonymizeUserName: vi.fn(),
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
      anonymizeByUserId: vi.fn(),
    };
    const studentEmailDomain = 'nhs.hal.ac.jp';
    const authKv = buildAuthKv();
    const firebaseTokenRepository = buildFirebaseTokenRepository();
    const service = createAuthService(
      userRepository,
      studentRepository,
      studentEmailDomain,
      authKv,
      firebaseTokenRepository
    );
    return {
      userRepository,
      studentRepository,
      authKv,
      firebaseTokenRepository,
      service,
    };
  }

  it('studentEmailDomainが未設定の場合はエラーを投げる', () => {
    const userRepository: IUserRepository = {
      exists: vi.fn(),
      isStaff: vi.fn(),
      getUserCategories: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      getDeletionStatus: vi.fn().mockResolvedValue('active'),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
      linkMicrosoftAccount: vi.fn(),
      markAsDeleted: vi.fn(),
      anonymizeUserName: vi.fn(),
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
      anonymizeByUserId: vi.fn(),
    };

    expect(() =>
      createAuthService(
        userRepository,
        studentRepository,
        '',
        buildAuthKv(),
        buildFirebaseTokenRepository()
      )
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

    it('deletion_status確認時はactiveだが、updateUser実行までの間に削除が完了した場合(TOCTOU)、ACCOUNT_DELETION_PENDINGを投げる', async () => {
      // ログイン処理がactiveであることを確認した直後に、非同期のアカウント
      // 削除がdeletion_status: deletedへ遷移させ、updateUser自体が
      // (WHERE deletion_status = 'active'により)0件更新でnullを返すケース。
      // updateUserがnullを返した後、最新状態を再確認してACCOUNT_DELETION_
      // PENDINGを優先させることを確認する(USER_NOT_FOUNDにフォールバック
      // させると、削除済みユーザーのTokenが発行される余地が残ってしまう)。
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (userRepository.getDeletionStatus as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('active')
        .mockResolvedValueOnce('deleted');
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'ACCOUNT_DELETION_PENDING'
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

    it('学籍番号で見つかった学生のdeletion_statusがdeletion_pendingの場合、ACCOUNT_DELETION_PENDINGを投げてlinkMicrosoftAccountを呼ばない', async () => {
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
        userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('deletion_pending');

      await expect(service.upsertUser(claims)).rejects.toThrow(
        'ACCOUNT_DELETION_PENDING'
      );
      expect(userRepository.linkMicrosoftAccount).not.toHaveBeenCalled();
    });

    it('学籍番号で見つかった学生のdeletion_statusがdeletedの場合、古いuser_idへ紐付けず新規アカウントとして作成する', async () => {
      const { userRepository, studentRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: 'nhs50000@nhs.hal.ac.jp',
      });
      const created = buildAppUser({ id: 'user-new' });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        studentRepository.findByStudentNum as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        student_id: 1,
        user_id: 100,
        user_name: '田中太郎(削除済み)',
        class_room_id: 1,
        class_room_name: '3年A組',
        attendance_number: 5,
        student_id_number: '50000',
        is_live_active: true,
      });
      (
        userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('deleted');
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(created);

      const result = await service.upsertUser(claims);

      expect(userRepository.linkMicrosoftAccount).not.toHaveBeenCalled();
      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalledWith({
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'nhs50000@nhs.hal.ac.jp',
        displayName: '田中太郎',
      });
      expect(result).toEqual(created);
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

    it('deletion_status確認時はactiveだが、linkMicrosoftAccount実行までの間に削除が完了した場合(TOCTOU)、ACCOUNT_DELETION_PENDINGを投げる', async () => {
      // getDeletionStatusでactiveと確認した直後に、非同期のアカウント削除が
      // 完了しdeletedへ遷移した場合、linkMicrosoftAccount自体が
      // (INSERT ... WHERE deletion_status = 'active'により)0行挿入となり
      // ACCOUNT_DELETION_PENDINGを投げる。この例外がSTUDENT_ALREADY_LINKED
      // 等のUNIQUE制約違反ハンドリングに紛れて握りつぶされず、外へ
      // 伝播することを確認する(削除済みユーザーのTokenが発行される
      // 余地を残さないため)。
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
        userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('active');
      (
        userRepository.linkMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('ACCOUNT_DELETION_PENDING'));

      await expect(service.upsertUser(claims)).rejects.toThrow(
        'ACCOUNT_DELETION_PENDING'
      );
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

// レビュー指摘: ログイン処理の「deletion_status確認」と「Microsoft連携の
// 作成/更新」が別クエリのため、両者の間にアカウント削除(markAsDeleted)が
// 非同期に割り込むと、確認時点ではactiveでも実行時には既にdeletedになって
// いる可能性がある(TOCTOU)。ここではモックではなく実DB・実UserRepository/
// StudentRepositoryを使い、実際に
//   1. ログイン処理がactiveであることを確認する
//   2. (この間に)アカウント削除が完了し、deletedになってMicrosoft連携が
//      削除される
//   3. ログイン処理が、削除済みユーザーへMicrosoft連携を作り直そうとする
// という順序を再現し、4(削除済みユーザーのTokenが発行される)が
// 起きないことを確認する。
describe('createAuthService (実DB・TOCTOU再現)', () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare('DELETE FROM firebase_tokens').run();
    await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
    await workerEnv.DB.prepare('DELETE FROM students').run();
    await workerEnv.DB.prepare('DELETE FROM users').run();
  });

  function buildRealService() {
    const userRepository = createUserRepository(workerEnv.DB);
    const studentRepository = createStudentRepository(workerEnv.DB);
    const firebaseTokenRepository = createFirebaseTokenRepository(workerEnv.DB);
    const authKv = buildAuthKv();
    const service = createAuthService(
      userRepository,
      studentRepository,
      'nhs.hal.ac.jp',
      authKv,
      firebaseTokenRepository
    );
    return {
      userRepository,
      studentRepository,
      firebaseTokenRepository,
      authKv,
      service,
    };
  }

  it('既存ユーザーの確認直後に削除が完了しても、Tokenが発行されずACCOUNT_DELETION_PENDINGになる', async () => {
    const { userRepository, service } = buildRealService();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-toctou-1', 'tid-toctou-1')"
    )
      .bind(user!.user_id)
      .run();

    // 1. ログイン処理がactiveであることを確認する時点を、実際の
    //    getDeletionStatus呼び出しをspyして再現する。
    const getDeletionStatusSpy = vi.spyOn(userRepository, 'getDeletionStatus');
    getDeletionStatusSpy.mockImplementationOnce(async userId => {
      const status = await createUserRepository(workerEnv.DB).getDeletionStatus(
        userId
      );
      // 2. 確認直後、非同期のアカウント削除が完了する
      //    (deletion_status: deleted かつ microsoft_account_links 削除)。
      await userRepository.markAsDeleted(userId);
      return status; // 確認した時点ではまだ 'active'
    });

    // 3〜4. ログイン処理が続行し、Microsoft連携を作り直そうとするが、
    //       Tokenは発行されない(ACCOUNT_DELETION_PENDING)。
    await expect(
      service.upsertUser(
        buildClaims({ oid: 'oid-toctou-1', tid: 'tid-toctou-1' })
      )
    ).rejects.toThrow('ACCOUNT_DELETION_PENDING');

    const linkRow = await workerEnv.DB.prepare(
      'SELECT * FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(linkRow).toBeNull();
  });

  it('学籍番号紐付けの確認直後に削除が完了しても、古いuser_idへ紐付けられずACCOUNT_DELETION_PENDINGになる', async () => {
    const { userRepository, service } = buildRealService();

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('T1', 'TOCTOUクラス') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '80001')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();

    const getDeletionStatusSpy = vi.spyOn(userRepository, 'getDeletionStatus');
    getDeletionStatusSpy.mockImplementationOnce(async userId => {
      const status = await createUserRepository(workerEnv.DB).getDeletionStatus(
        userId
      );
      await userRepository.markAsDeleted(userId);
      return status;
    });

    await expect(
      service.upsertUser(
        buildClaims({
          oid: 'oid-toctou-2',
          tid: 'tid-toctou-2',
          preferred_username: 'nhs80001@nhs.hal.ac.jp',
        })
      )
    ).rejects.toThrow('ACCOUNT_DELETION_PENDING');

    const linkRow = await workerEnv.DB.prepare(
      'SELECT * FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(linkRow).toBeNull();
  });
});

// #265 PR3: 削除開始直後に利用を停止する。startAccountDeletionが
// DB(deletion_status/links)・KV(Refresh Session)・Firebase Token登録の
// 3種類を一括で失効させることを実DBで確認する。
describe('createAuthService (実DB・startAccountDeletion)', () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare('DELETE FROM firebase_tokens').run();
    await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
    await workerEnv.DB.prepare('DELETE FROM students').run();
    await workerEnv.DB.prepare('DELETE FROM users').run();
  });

  function buildRealService() {
    const userRepository = createUserRepository(workerEnv.DB);
    const studentRepository = createStudentRepository(workerEnv.DB);
    const firebaseTokenRepository = createFirebaseTokenRepository(workerEnv.DB);
    const authKv = buildAuthKv();
    const service = createAuthService(
      userRepository,
      studentRepository,
      'nhs.hal.ac.jp',
      authKv,
      firebaseTokenRepository
    );
    return {
      userRepository,
      firebaseTokenRepository,
      authKv,
      service,
    };
  }

  it('DB状態遷移・全Refresh Session失効・Firebase Token無効化を一括で行う', async () => {
    const { userRepository, firebaseTokenRepository, authKv, service } =
      buildRealService();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-1', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();
    await firebaseTokenRepository.register({
      userId: user!.user_id,
      platform: 'android',
      fcmToken: 'fcm-token-1',
    });
    await authKv.put(
      `mobile_refresh:refresh-1`,
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      })
    );
    await authKv.put(`mobile_refresh_by_user:${userId}`, 'refresh-1');

    await service.startAccountDeletion(userId);

    // DB: deletion_status: deleted、microsoft_account_links削除
    await expect(userRepository.getDeletionStatus(userId)).resolves.toBe(
      'deleted'
    );
    const linkRow = await workerEnv.DB.prepare(
      'SELECT * FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(linkRow).toBeNull();

    // KV: Refresh Sessionが失効(mobile_refresh/mobile_refresh_by_user共に削除)
    expect(await authKv.get('mobile_refresh:refresh-1')).toBeNull();
    expect(await authKv.get(`mobile_refresh_by_user:${userId}`)).toBeNull();

    // Firebase Token登録がPush通知対象から除外される
    const tokenRow = await workerEnv.DB.prepare(
      'SELECT is_firebase_active FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ is_firebase_active: number }>();
    expect(tokenRow?.is_firebase_active).toBe(0);
  });

  it('Refresh Sessionが存在しないユーザーでも冪等に成功する', async () => {
    const { userRepository, service } = buildRealService();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中花子') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);

    await expect(service.startAccountDeletion(userId)).resolves.toBeUndefined();
    await expect(userRepository.getDeletionStatus(userId)).resolves.toBe(
      'deleted'
    );
  });
});
