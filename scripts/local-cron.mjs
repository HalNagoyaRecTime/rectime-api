import { CronJob } from 'cron';

// Cloudflareは日曜=1、cronパッケージは日曜=0として解釈する。
export function toLocalCronExpression(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron式は5項目で指定してください');
  fields[4] = fields[4]
    .split(',')
    .map(part => {
      const [range, step] = part.split('/');
      const localRange = range.replace(/\d+/g, value => {
        const day = Number(value);
        if (day < 1 || day > 7) throw new Error('曜日は1〜7で指定してください');
        return String(day - 1);
      });
      return step === undefined ? localRange : `${localRange}/${step}`;
    })
    .join(',');
  return fields.join(' ');
}

export function createLocalCronScheduler(
  expressions,
  worker,
  logger = console
) {
  const pending = new Set();
  const jobs = [...new Set(expressions)].map(expression =>
    CronJob.from({
      cronTime: toLocalCronExpression(expression),
      timeZone: 'UTC',
      start: false,
      // 本番同様に重なった発火も渡し、排他・冪等性は既存Workerで検証する。
      onTick: async () => {
        const operation = Promise.resolve().then(() =>
          worker.scheduled({ cron: expression, scheduledTime: Date.now() })
        );
        pending.add(operation);
        try {
          const result = await operation;
          if (result.outcome !== 'ok')
            throw new Error(`実行結果: ${result.outcome}`);
          logger.log(`[LOCAL_CRON] ${expression} を実行しました`);
        } catch (error) {
          logger.error(
            `[LOCAL_CRON] ${expression} の実行に失敗しました`,
            error
          );
        } finally {
          pending.delete(operation);
        }
      },
    })
  );
  return {
    jobs,
    start() {
      jobs.forEach(job => job.start());
    },
    async stop() {
      await Promise.all(jobs.map(job => job.stop()));
      await Promise.allSettled([...pending]);
    },
  };
}
