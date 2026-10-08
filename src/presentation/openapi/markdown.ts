import { z } from './schemas';

// 空白だけの本文は拒否するが、Markdownの字下げ・行末空白・改行は削らない。
export const markdownBodySchema = z
  .string()
  .min(1)
  .refine(value => value.trim().length > 0, {
    message: '本文には空白以外の文字を含めてください',
  });
