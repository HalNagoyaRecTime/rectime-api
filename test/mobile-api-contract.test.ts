import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';

type OpenApiOperation = {
  security?: Array<Record<string, unknown>>;
  responses?: Record<string, unknown>;
};

type OpenApiSchema = {
  required?: string[];
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
};

let document: OpenApiDocument;

beforeAll(async () => {
  const response = await app.fetch(
    new Request('http://example.com/openapi.json'),
    env
  );

  expect(response.status).toBe(200);
  document = (await response.json()) as OpenApiDocument;
});

const mobileGetPaths = [
  '/api/v1/events',
  '/api/v1/events/{eventId}',
  '/api/v1/events/{eventId}/gatherings',
  '/api/v1/me/notifications',
  '/api/v1/me/notifications/{notificationId}',
] as const;

describe('mobile API contract', () => {
  it.each(mobileGetPaths)(
    'documents Bearer authentication for GET %s',
    path => {
      const operation = document.paths[path]?.get;

      expect(operation).toBeDefined();
      expect(operation?.security).toContainEqual({ Bearer: [] });
      expect(operation?.responses).toHaveProperty('401');
    }
  );

  it.each([
    [
      'Event',
      [
        'event_id',
        'event_name',
        'venue',
        'start_time',
        'end_time',
        'created_at',
        'updated_at',
      ],
    ],
    [
      'Gathering',
      [
        'gathering_id',
        'event_id',
        'gathering_spot_id',
        'gathering_time',
        'round',
        'event_name',
        'gathering_spot_name',
        'created_at',
        'updated_at',
      ],
    ],
    [
      'MobileNotification',
      [
        'notification_id',
        'notification_type',
        'title',
        'body',
        'scheduled_at',
        'related_event',
      ],
    ],
    ['MobileNotificationList', ['notifications', 'total', 'limit', 'offset']],
  ])(
    'keeps the %s response fields required by the mobile client',
    (schemaName, fields) => {
      expect(document.components.schemas[schemaName]?.required).toEqual(
        expect.arrayContaining(fields)
      );
    }
  );
});
