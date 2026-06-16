import { getDb } from '../lib/db';
import { createStudentRepository } from '../infrastructure/repositories/StudentRepository';
import { createStudentService } from '../infrastructure/services/StudentService';
import { createStudentController } from '../presentation/controllers/StudentController';
import { createEventRepository } from '../infrastructure/repositories/EventRepository';
import { createEventService } from '../infrastructure/services/EventService';
import { createEventController } from '../presentation/controllers/EventController';
import { createEntryRepository } from '../infrastructure/repositories/EntryRepository';
import { createEntryService } from '../infrastructure/services/EntryService';
import { createEntryController } from '../presentation/controllers/EntryController';
import { D1Database } from '@cloudflare/workers-types';

type Env = {
  DB: D1Database;
};

export function createDIContainer(env?: Env) {
  const db = getDb(env);

  if (!db) {
    throw new Error('Database is not available');
  }

  // Repositories
  const studentRepository = createStudentRepository(db);
  const eventRepository = createEventRepository(db);
  const entryRepository = createEntryRepository(db);

  // Services
  const studentService = createStudentService(studentRepository);
  const eventService = createEventService(eventRepository);
  const entryService = createEntryService(entryRepository);

  // Controllers (function-based)
  const studentController = createStudentController(studentService);
  const eventController = createEventController(eventService);
  const entryController = createEntryController(entryService);

  return {
    db,
    studentController,
    eventController,
    entryController,
  };
}

export type DIContainer = ReturnType<typeof createDIContainer>;

let containerInstance: DIContainer | null = null;

export function getDIContainer(env?: Env): DIContainer {
  // Cloudflare Workers環境では毎回新しいインスタンスを作成
  if (env) {
    return createDIContainer(env);
  }

  // ローカル開発環境ではシングルトンを使用
  if (!containerInstance) {
    containerInstance = createDIContainer();
  }
  return containerInstance;
}
