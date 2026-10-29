import { describe, expect, it } from 'vitest';
import {
  eventWriteSchema,
  eventUpdateSchema,
} from '../../../src/presentation/openapi/events';
import { markdownBodySchema } from '../../../src/presentation/openapi/markdown';
import { notificationContentSchema } from '../../../src/presentation/openapi/notification/commonSchemas';
import { notificationContentPatchSchema } from '../../../src/presentation/openapi/notification/admin';

const bodies = [
  '    code\n',
  '\n本文  \n次の行  ',
  '本文\\\n次の行',
  '本文\r\n\r\n段落\r\n',
];

describe('Markdown本文の空白契約', () => {
  it.each(bodies)('本文を加工せず保持する: %j', body => {
    expect(markdownBodySchema.parse(body)).toBe(body);
    const content = notificationContentSchema.parse({
      push: { title: ' title ', body: ' push ' },
      detail: { title: ' title ', body },
    });
    expect(content.detail.body).toBe(body);
    expect(content.push).toEqual({ title: 'title', body: 'push' });
    expect(
      notificationContentPatchSchema.parse({ detail: { body } }).detail?.body
    ).toBe(body);
    for (const schema of [eventWriteSchema, eventUpdateSchema]) {
      expect(
        schema.parse({
          event_name: '競技',
          rule_text: body,
          venue_ids: [1],
          start_time: '0900',
          end_time: '1000',
        }).rule_text
      ).toBe(body);
    }
  });
  it.each(['', ' ', '\n\t  '])('空白だけの通知本文は拒否する', body => {
    expect(markdownBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('イベントルールの文字数上限', () => {
  const base = {
    event_name: '競技',
    venue_ids: [1],
    start_time: '0900',
    end_time: '1000',
  };
  const schemas = [
    ['作成', eventWriteSchema],
    ['更新', eventUpdateSchema],
  ] as const;

  it.each(schemas)('%sで2000文字のルールを受け付ける', (_, schema) => {
    expect(
      schema.safeParse({ ...base, rule_text: 'あ'.repeat(2000) }).success
    ).toBe(true);
  });
  it.each(schemas)(
    '%sで改行を含む2000文字のルールを受け付ける',
    (_, schema) => {
      expect(
        schema.safeParse({ ...base, rule_text: 'あ\n'.repeat(1000) }).success
      ).toBe(true);
    }
  );
  it.each(schemas)('%sで2001文字のルールは拒否する', (_, schema) => {
    expect(
      schema.safeParse({ ...base, rule_text: 'あ'.repeat(2001) }).success
    ).toBe(false);
  });
});
