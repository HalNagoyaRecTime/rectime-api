import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../domain/entities/EventGathering';
import type { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';
import type { IEventGatheringSettingsRepository } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import type {
  IStudentRepository,
  StudentUserByClassRoomAttendanceNumber,
} from '../../domain/interfaces/repositories/IStudentRepository';
import type { IGatheringSettingsTransaction } from '../../domain/interfaces/transactions/IGatheringSettingsTransaction';
import {
  MAX_IMPORT_ROW_COUNT,
  parseCsvRows,
} from '../../infrastructure/masterImports/parseImportFile';
import type {
  GatheringImportErrorCode,
  GatheringImportErrorDTO,
  GatheringImportResultDTO,
  GatheringImportRoundDTO,
  GatheringImportWarningDTO,
} from '../dto/GatheringImportDTO';
import type { IGatheringNotificationGeneratorService } from './GatheringNotificationGeneratorService';
import type { IGatheringNotificationCleanupService } from './IGatheringNotificationCleanupService';
import { isForeignKeyError } from './foreignKeyError';
import type {
  CommitGatheringImportCommand,
  GatheringImportCommand,
  IGatheringImportService,
} from './IGatheringImportService';

const COLUMNS = {
  round: 'ラウンド',
  startTime: '開始時刻',
  gatheringTime: '集合時刻',
  gatheringSpot: '集合場所',
  student: '生徒',
} as const;

type Column = keyof typeof COLUMNS;

interface CsvRow extends Record<Column, string> {
  row_number: number;
}

interface ParsedStudent {
  class_code: string;
  attendance_number: number;
  name: string;
}

interface ValidRow {
  row_number: number;
  student_cell: string;
  round: number;
  round_start_time: string | null;
  gathering_time: string;
  gathering_spot: GatheringSpotEntity;
  student: ParsedStudent;
  user: StudentUserByClassRoomAttendanceNumber;
}

interface ImportPlan {
  result: Omit<GatheringImportResultDTO, 'event_id' | 'lock_version'>;
  rows: ValidRow[];
}

function readRows(csvText: string): CsvRow[] {
  const [header = [], ...lines] = parseCsvRows(csvText.replace(/^\uFEFF/, ''));
  const names = header.map(name => name.trim());
  const indexes = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, label]) => [key, names.indexOf(label)])
  ) as Record<Column, number>;
  if (Object.values(indexes).some(index => index < 0)) {
    throw new Error('Missing gathering import columns');
  }

  const rows = lines
    .map((cells, index) => {
      const row = { row_number: index + 2 } as CsvRow;
      for (const key of Object.keys(COLUMNS) as Column[]) {
        row[key] = (cells[indexes[key]] ?? '').trim();
      }
      return row;
    })
    .filter(row =>
      (Object.keys(COLUMNS) as Column[]).some(key => row[key] !== '')
    );
  if (rows.length > MAX_IMPORT_ROW_COUNT) {
    throw new Error('Too many gathering import rows');
  }
  return rows;
}

// Excelは 9:45 のように時の0を落として書き出すため、1桁の時も受け付ける。
function parseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

// 先頭の NH は学校ごとに違いうるため見ない。
function parseStudent(value: string): ParsedStudent | null {
  const [code, ...names] = value.split(/[\s\u3000]+/);
  if (code.length <= 10 || !/^\d{2}$/.test(code.slice(-2))) return null;
  return {
    class_code: code.slice(-10, -2),
    attendance_number: Number(code.slice(-2)),
    name: names.join(''),
  };
}

const withoutSpaces = (value: string) => value.replace(/[\s\u3000]/g, '');

const studentKey = (classCode: string, attendanceNumber: number) =>
  `${classCode}\u0000${attendanceNumber}`;

const gatheringKey = (
  round: number,
  gatheringTime: string,
  gatheringSpotId: number
) => `${round}\u0000${gatheringTime}\u0000${gatheringSpotId}`;

function buildRounds(rows: ValidRow[]): GatheringImportRoundDTO[] {
  const rounds = new Map<number, GatheringImportRoundDTO>();
  const gatherings = new Map<
    string,
    GatheringImportRoundDTO['gatherings'][number]
  >();
  for (const row of rows) {
    let round = rounds.get(row.round);
    if (!round) {
      round = {
        round: row.round,
        start_time: row.round_start_time,
        gatherings: [],
      };
      rounds.set(row.round, round);
    }
    const key = gatheringKey(
      row.round,
      row.gathering_time,
      row.gathering_spot.gathering_spot_id
    );
    let gathering = gatherings.get(key);
    if (!gathering) {
      gathering = {
        gathering_time: row.gathering_time,
        gathering_spot: {
          gathering_spot_id: row.gathering_spot.gathering_spot_id,
          gathering_spot_name: row.gathering_spot.gathering_spot_name,
        },
        members: [],
      };
      gatherings.set(key, gathering);
      round.gatherings.push(gathering);
    }
    gathering.members.push({
      row_number: row.row_number,
      user_id: row.user.userId,
      class_code: row.user.classCode,
      attendance_number: row.user.attendanceNumber,
      user_name: row.user.userName,
    });
  }
  return Array.from(rounds.values())
    .sort((a, b) => a.round - b.round)
    .map(round => ({
      ...round,
      gatherings: round.gatherings.sort(
        (a, b) =>
          a.gathering_time.localeCompare(b.gathering_time) ||
          a.gathering_spot.gathering_spot_id -
            b.gathering_spot.gathering_spot_id
      ),
    }));
}

export function createGatheringImportService(
  eventRepository: IEventRepository,
  gatheringSpotRepository: IGatheringSpotRepository,
  studentRepository: IStudentRepository,
  eventGatheringSettingsRepository: IEventGatheringSettingsRepository,
  gatheringNotificationGeneratorService: IGatheringNotificationGeneratorService,
  gatheringNotificationCleanupService: IGatheringNotificationCleanupService,
  gatheringSettingsTransaction: IGatheringSettingsTransaction
): IGatheringImportService {
  const plan = async (csvText: string): Promise<ImportPlan> => {
    const csvRows = readRows(csvText);
    const errors: GatheringImportErrorDTO[] = [];
    const warnings: GatheringImportWarningDTO[] = [];
    const addError = (
      row: { row_number: number; student: string },
      code: GatheringImportErrorCode,
      message: string
    ) =>
      errors.push({
        row_number: row.row_number,
        code,
        message,
        student: row.student,
      });

    const spotsByName = new Map<string, GatheringSpotEntity[]>();
    for (const spot of await gatheringSpotRepository.findAll()) {
      const name = spot.gathering_spot_name.trim();
      spotsByName.set(name, [...(spotsByName.get(name) ?? []), spot]);
    }

    const parsedRows: Omit<ValidRow, 'user'>[] = [];
    for (const row of csvRows) {
      const round = /^\d+$/.test(row.round) ? Number(row.round) : NaN;
      const startTime = row.startTime === '' ? null : parseTime(row.startTime);
      const gatheringTime = parseTime(row.gatheringTime);
      const spots = spotsByName.get(row.gatheringSpot) ?? [];
      const student = parseStudent(row.student);
      if (!(round >= 1 && round <= 99)) {
        addError(
          row,
          'INVALID_ROUND',
          `ラウンド「${row.round}」は1〜99の整数ではありません`
        );
      } else if (startTime === null && row.startTime !== '') {
        addError(
          row,
          'INVALID_START_TIME',
          `開始時刻「${row.startTime}」を時刻として読めません`
        );
      } else if (gatheringTime === null) {
        addError(
          row,
          'INVALID_GATHERING_TIME',
          `集合時刻「${row.gatheringTime}」を時刻として読めません`
        );
      } else if (spots.length === 0) {
        addError(
          row,
          'GATHERING_SPOT_NOT_FOUND',
          `集合場所「${row.gatheringSpot}」は登録されていません`
        );
      } else if (spots.length > 1) {
        addError(
          row,
          'GATHERING_SPOT_AMBIGUOUS',
          `集合場所「${row.gatheringSpot}」と同じ名前の集合場所が複数あります`
        );
      } else if (!student) {
        addError(row, 'INVALID_STUDENT', '生徒の番号を読み取れません');
      } else {
        parsedRows.push({
          row_number: row.row_number,
          student_cell: row.student,
          round,
          round_start_time: startTime?.replace(':', '') ?? null,
          gathering_time: gatheringTime,
          gathering_spot: spots[0],
          student,
        });
      }
    }

    const users = new Map(
      (
        await studentRepository.findActiveUsersByClassRoomAttendanceNumbers(
          parsedRows.map(row => ({
            classCode: row.student.class_code,
            attendanceNumber: row.student.attendance_number,
          }))
        )
      ).map(user => [studentKey(user.classCode, user.attendanceNumber), user])
    );
    let rows: ValidRow[] = [];
    for (const row of parsedRows) {
      const user = users.get(
        studentKey(row.student.class_code, row.student.attendance_number)
      );
      if (user) {
        rows.push({ ...row, user });
      } else {
        addError(
          { row_number: row.row_number, student: row.student_cell },
          'STUDENT_NOT_FOUND',
          `クラス記号 ${row.student.class_code}・出席番号 ${row.student.attendance_number} の生徒は登録されていません`
        );
      }
    }

    const rowCountByUser = new Map<number, number>();
    for (const row of rows) {
      rowCountByUser.set(
        row.user.userId,
        (rowCountByUser.get(row.user.userId) ?? 0) + 1
      );
    }
    rows = rows.filter(row => {
      if (rowCountByUser.get(row.user.userId) === 1) return true;
      addError(
        { row_number: row.row_number, student: row.student_cell },
        'DUPLICATE_STUDENT',
        '同じ生徒が複数の行にあります'
      );
      return false;
    });

    const startTimesByRound = new Map<number, Set<string | null>>();
    for (const row of rows) {
      const startTimes = startTimesByRound.get(row.round) ?? new Set();
      startTimes.add(row.round_start_time);
      startTimesByRound.set(row.round, startTimes);
    }
    rows = rows.filter(row => {
      if (startTimesByRound.get(row.round)!.size === 1) return true;
      addError(
        { row_number: row.row_number, student: row.student_cell },
        'ROUND_START_TIME_MISMATCH',
        `ラウンド ${row.round} の行で開始時刻が揃っていません`
      );
      return false;
    });

    for (const row of rows) {
      if (
        row.student.name !== '' &&
        withoutSpaces(row.student.name) !== withoutSpaces(row.user.userName)
      ) {
        warnings.push({
          row_number: row.row_number,
          code: 'NAME_MISMATCH',
          message: `登録されている氏名は「${row.user.userName}」です`,
          student: row.student_cell,
          registered_name: row.user.userName,
        });
      }
    }

    errors.sort((a, b) => a.row_number - b.row_number);
    return {
      rows,
      result: {
        total_rows: csvRows.length,
        imported_rows: rows.length,
        excluded_rows: csvRows.length - rows.length,
        rounds: buildRounds(rows),
        errors,
        warnings,
      },
    };
  };

  const findEvent = async (eventId: number) => {
    const event = await eventRepository.findById(eventId);
    if (!event) throw new Error('Event not found');
    return event;
  };

  // 作成済みの自動通知を残すため、round・集合時刻・集合場所が同じ既存の
  // 集合予定は削除せずに使い続ける。
  const buildChangeSet = (
    eventId: number,
    current: EventGatheringEntity[],
    rows: ValidRow[]
  ): EventGatheringChangeSet => {
    const reusable = new Map<string, EventGatheringEntity>();
    for (const gathering of current) {
      const key = gatheringKey(
        gathering.round,
        gathering.gathering_time,
        gathering.gathering_spot_id
      );
      if (!reusable.has(key)) reusable.set(key, gathering);
    }

    const changeSet: EventGatheringChangeSet = {
      event_id: eventId,
      creates: [],
      updates: [],
      delete_ids: [],
      member_assignments: [],
    };
    const keptIds = new Set<number>();
    for (const round of buildRounds(rows)) {
      for (const gathering of round.gatherings) {
        const input = {
          round: round.round,
          round_start_time: round.start_time,
          gathering_time: gathering.gathering_time,
          gathering_spot_id: gathering.gathering_spot.gathering_spot_id,
        };
        const existing = reusable.get(
          gatheringKey(
            input.round,
            input.gathering_time,
            input.gathering_spot_id
          )
        );
        if (!existing) {
          changeSet.creates.push(input);
        } else {
          keptIds.add(existing.gathering_id);
          if (existing.round_start_time !== input.round_start_time) {
            changeSet.updates.push({
              gathering_id: existing.gathering_id,
              ...input,
            });
          }
        }
        changeSet.member_assignments!.push({
          ...input,
          user_ids: gathering.members.map(member => member.user_id),
        });
      }
    }
    changeSet.delete_ids = current
      .map(gathering => gathering.gathering_id)
      .filter(id => !keptIds.has(id));
    return changeSet;
  };

  return {
    async preview(command: GatheringImportCommand) {
      const event = await findEvent(command.event_id);
      const { result } = await plan(command.csv_text);
      return {
        event_id: command.event_id,
        lock_version: event.lock_version,
        ...result,
      };
    },

    async commit(command: CommitGatheringImportCommand) {
      const event = await findEvent(command.event_id);
      if (event.lock_version !== command.lock_version) {
        throw new Error('Event update conflict');
      }
      const { result, rows } = await plan(command.csv_text);
      if (rows.length === 0) throw new Error('No gathering import rows');

      const current = await eventGatheringSettingsRepository.findByEventId(
        command.event_id
      );
      const changeSet = buildChangeSet(command.event_id, current, rows);
      const notificationCleanup =
        gatheringNotificationCleanupService.prepareCleanup(
          changeSet.delete_ids
        );
      let applied: boolean;
      try {
        applied = await gatheringSettingsTransaction.apply(
          changeSet,
          notificationCleanup ? { notificationCleanup } : {},
          { expectedLockVersion: command.lock_version }
        );
      } catch (error) {
        // 確認から保存までの間に集合場所が削除されると、外部キー制約で失敗する。
        if (!isForeignKeyError(error)) throw error;
        await findEvent(command.event_id);
        const spotIds = rows.map(row => row.gathering_spot.gathering_spot_id);
        const existing = await gatheringSpotRepository.findExistingIds(spotIds);
        if (spotIds.some(id => !existing.has(id))) {
          throw new Error('Gathering spot not found');
        }
        throw error;
      }
      if (!applied) {
        await findEvent(command.event_id);
        throw new Error('Event update conflict');
      }

      const savedEvent = await findEvent(command.event_id);
      const currentIds = new Set(
        current.map(gathering => gathering.gathering_id)
      );
      const createdGatherings = (
        await eventGatheringSettingsRepository.findByEventId(command.event_id)
      ).filter(gathering => !currentIds.has(gathering.gathering_id));
      // 使い続ける集合予定は集合時刻が変わらず、通知を作り直す必要が無い。
      // 1件ごとにクエリを投げるため、Free プランの1回あたりのクエリ数を
      // 超えないよう、作成した集合予定に絞る。
      // 保存は確定済み。通知生成の一時失敗で500にせず、Cronの定期
      // reconciliationに回復を委ねる(集合設定の保存と同じ扱い)。
      for (const gathering of createdGatherings) {
        try {
          await gatheringNotificationGeneratorService.generate(
            gathering.gathering_id
          );
        } catch {
          // 定期reconciliationが次回Cronで再試行する。
        }
      }

      return {
        event_id: command.event_id,
        lock_version: savedEvent.lock_version,
        ...result,
      };
    },
  };
}
