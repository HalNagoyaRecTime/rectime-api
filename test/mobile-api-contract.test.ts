import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import swaggerYaml from '../public/swagger.yml?raw';

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

const document = parse(swaggerYaml) as OpenApiDocument;

const mobileGetPaths = [
  '/events',
  '/events/{eventId}',
  '/events/{eventId}/gatherings',
  '/me/notifications',
  '/me/notifications/{notificationId}',
] as const;

describe('mobile API contract', () => {
  it.each(mobileGetPaths)(
    'documents Bearer authentication for GET %s',
    path => {
      const operation = document.paths[path]?.get;

      expect(operation).toBeDefined();
      expect(operation?.security).toContainEqual({ bearerAuth: [] });
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
    [
      'MobileNotificationListResponse',
      ['notifications', 'total', 'limit', 'offset'],
    ],
  ])(
    'keeps the %s response fields required by the mobile client',
    (schemaName, fields) => {
      expect(document.components.schemas[schemaName]?.required).toEqual(
        expect.arrayContaining(fields)
      );
    }
  );
});
