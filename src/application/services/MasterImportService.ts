import { z } from 'zod';
import type {
  DurableObjectNamespace,
  KVNamespace,
} from '@cloudflare/workers-types';
import type { MasterImportCommitLock } from '../../infrastructure/masterImports/MasterImportCommitLock';
import type {
  MasterImportSession,
  MasterImportType,
} from '../../domain/entities/MasterImport';
import {
  parseImportFile,
  type ParsedRow,
} from '../../infrastructure/masterImports/parseImportFile';
import {
  getMasterImportSession,
  saveMasterImportSession,
  TTL_SECONDS,
} from '../../infrastructure/masterImports/MasterImportStore';
import type { IStudentService } from './IStudentService';
import type { IClassRoomService } from './IClassRoomService';
import type { ITeacherService } from './ITeacherService';
import type { StudentImportRow } from '../dto/StudentDTO';
import type { ClassRoomImportRow } from '../dto/ClassRoomDTO';
import type { TeacherImportRow } from '../dto/TeacherDTO';
import type {
  CommitMasterImportOutcome,
  CreateMasterImportInput,
  IMasterImportService,
} from './IMasterImportService';
import type { MasterImportSessionDTO } from '../dto/MasterImportDTO';

const numericField = z
  .union([z.string(), z.number()])
  .transform(value => Number(value))
  .pipe(z.number().int().positive());

const stringField = z
  .union([z.string(), z.number()])
  .transform(value => String(value).trim())
  .pipe(z.string().min(1).max(100));

const studentRowSchema = z.object({
  class_code: stringField,
  attendance_number: numericField,
  student_id_number: stringField,
  last_name: stringField,
  first_name: stringField,
});

const classRoomRowSchema = z.object({
  class_code: stringField,
  class_name: stringField,
});

const teacherRowSchema = z.object({
  last_name: stringField,
  first_name: stringField,
});

function toDTO(
  session: MasterImportSession,
  offset: number,
  limit: number
): MasterImportSessionDTO {
  return {
    validated_file_id: session.validated_file_id,
    type: session.type,
    status: session.status,
    file_name: session.file_name,
    total: session.total,
    success_count: session.success_count,
    error_count: session.error_count,
    errors: session.errors,
    rows: session.rows.slice(offset, offset + limit),
    rows_total: session.rows.length,
    rows_limit: limit,
    rows_offset: offset,
    created_at: session.created_at,
    committed_result: session.committed_result,
    expires_at: new Date(
      new Date(session.updated_at ?? session.created_at).getTime() +
        TTL_SECONDS * 1000
    ).toISOString(),
  };
}

function shapeRow(type: MasterImportType, rowIndex: number, raw: ParsedRow) {
  const schema =
    type === 'students'
      ? studentRowSchema
      : type === 'classrooms'
        ? classRoomRowSchema
        : teacherRowSchema;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${rowIndex + 1}行目の内容が不正です: ${parsed.error.issues
        .map(issue => `${issue.path.join('.')} ${issue.message}`)
        .join(', ')}`
    );
  }
  return parsed.data;
}

const COMMIT_WAIT_POLL_INTERVAL_MS = 150;
const COMMIT_WAIT_MAX_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMasterImportService(
  kv: KVNamespace,
  commitLock: DurableObjectNamespace<MasterImportCommitLock>,
  studentService: IStudentService,
  classRoomService: IClassRoomService,
  teacherService: ITeacherService
): IMasterImportService {
  async function validateByType(type: MasterImportType, rows: unknown[]) {
    if (type === 'students') {
      return studentService.validateStudentImport({
        rows: rows as StudentImportRow[],
      });
    }
    if (type === 'classrooms') {
      return classRoomService.validateClassRoomImport({
        rows: rows as ClassRoomImportRow[],
      });
    }
    return teacherService.validateTeacherImport({
      rows: rows as TeacherImportRow[],
    });
  }

  async function commitByType(type: MasterImportType, rows: unknown[]) {
    if (type === 'students') {
      return studentService.commitStudentImport({
        rows: rows as StudentImportRow[],
      });
    }
    if (type === 'classrooms') {
      return classRoomService.commitClassRoomImport({
        rows: rows as ClassRoomImportRow[],
      });
    }
    return teacherService.commitTeacherImport({
      rows: rows as TeacherImportRow[],
    });
  }

  return {
    async createImport(
      input: CreateMasterImportInput
    ): Promise<MasterImportSessionDTO> {
      const rawRows = await parseImportFile(input.file, input.fileName);
      const rows = rawRows.map((raw, index) =>
        shapeRow(input.type, index, raw)
      );

      const validation = await validateByType(input.type, rows);

      const now = new Date().toISOString();

      const session: MasterImportSession = {
        validated_file_id: crypto.randomUUID(),
        type: input.type,
        status: 'validated',
        file_name: input.fileName,
        total: validation.total,
        success_count: validation.success_count,
        error_count: validation.error_count,
        errors: validation.errors,
        rows,
        created_at: now,
        updated_at: now,
        committed_result: null,
      };

      await saveMasterImportSession(kv, session);
      return toDTO(session, 0, rows.length || 1);
    },

    async getImport(
      validatedFileId: string,
      pagination: { offset: number; limit: number }
    ): Promise<MasterImportSessionDTO | null> {
      const session = await getMasterImportSession(kv, validatedFileId);
      if (!session) {
        return null;
      }
      return toDTO(session, pagination.offset, pagination.limit);
    },

    async commitImport(
      validatedFileId: string
    ): Promise<CommitMasterImportOutcome> {
      const session = await getMasterImportSession(kv, validatedFileId);
      if (!session) {
        return { status: 'not_found' };
      }

      if (session.status === 'committed') {
        return {
          status: 'committed',
          session: toDTO(session, 0, session.rows.length || 1),
          alreadyCommitted: true,
        };
      }

      if (session.error_count > 0) {
        return {
          status: 'has_errors',
          session: toDTO(session, 0, session.rows.length || 1),
        };
      }

      const lockStub = commitLock.get(commitLock.idFromName(validatedFileId));
      const acquired = await lockStub.tryBeginCommit();

      if (!acquired) {
        for (let attempt = 0; attempt < COMMIT_WAIT_MAX_ATTEMPTS; attempt++) {
          await sleep(COMMIT_WAIT_POLL_INTERVAL_MS);
          const latest = await getMasterImportSession(kv, validatedFileId);
          if (latest?.status === 'committed') {
            return {
              status: 'committed',
              session: toDTO(latest, 0, latest.rows.length || 1),
              alreadyCommitted: true,
            };
          }
        }
        return { status: 'timeout' };
      }

      try {
        const commitResult = await commitByType(session.type, session.rows);

        if (commitResult.error_count > 0) {
          const sessionForResponse: MasterImportSession = {
            ...session,
            error_count: commitResult.error_count,
            errors: commitResult.errors,
          };
          return {
            status: 'has_errors',
            session: toDTO(
              sessionForResponse,
              0,
              sessionForResponse.rows.length || 1
            ),
          };
        }

        const updatedSession: MasterImportSession = {
          ...session,
          status: 'committed',
          updated_at: new Date().toISOString(),
          committed_result: {
            imported: commitResult.imported,
            error_count: commitResult.error_count,
            errors: commitResult.errors,
          },
        };
        await saveMasterImportSession(kv, updatedSession);

        return {
          status: 'committed',
          session: toDTO(updatedSession, 0, updatedSession.rows.length || 1),
          alreadyCommitted: false,
        };
      } finally {
        await lockStub.releaseLock();
      }
    },
  };
}
