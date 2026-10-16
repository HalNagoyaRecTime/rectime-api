import { AwsV4Signer } from 'aws4fetch';
import { IImageUrlSigner } from '../../domain/interfaces/storages/IImageUrlSigner';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface R2ImageUrlSignerConfig {
  bucketUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function startOfJstDay(date: Date): Date {
  const jstDays = Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS);
  return new Date(jstDays * DAY_MS - JST_OFFSET_MS);
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

export function createR2ImageUrlSigner(
  config: R2ImageUrlSignerConfig,
  now: () => Date = () => new Date()
): IImageUrlSigner {
  return {
    async sign(imageKey) {
      const url = new URL(`${config.bucketUrl}/${imageKey}`);
      url.searchParams.set('X-Amz-Expires', String(SEVEN_DAYS_SECONDS));
      const signed = await new AwsV4Signer({
        method: 'GET',
        url: url.toString(),
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
        // 署名時刻を揃えないとレスポンスのたびにURLが変わり、端末の画像キャッシュが
        // 効かない。UTCの0時で揃えると当日の朝9時に全端末のURLが一斉に変わるため、
        // 日本時間の0時で揃える。
        datetime: toAmzDate(startOfJstDay(now())),
        signQuery: true,
      }).sign();
      return signed.url.toString();
    },
  };
}
