import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/index';

describe('Student所属変更APIのOpenAPI定義', () => {
  let schemas: Record<string, unknown>;

  beforeAll(async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await res.json()) as {
      components: { schemas: Record<string, unknown> };
    };
    schemas = document.components.schemas;
  });

  it('所属情報は両方numberまたは両方nullとして公開する', () => {
    expect(schemas.StudentClassRoomAssignmentRequest).toMatchObject({
      description:
        'class_room_idとattendance_numberは両方に値を指定するか、両方をnullにする。',
      anyOf: [
        {
          type: 'object',
          required: ['class_room_id', 'attendance_number'],
          properties: {
            class_room_id: {
              type: 'integer',
              minimum: 0,
              exclusiveMinimum: true,
            },
            attendance_number: {
              type: 'integer',
              minimum: 0,
              exclusiveMinimum: true,
            },
          },
        },
        {
          type: 'object',
          required: ['class_room_id', 'attendance_number'],
          properties: {
            class_room_id: { nullable: true },
            attendance_number: { nullable: true },
          },
        },
      ],
    });
  });
});
