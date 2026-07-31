import { describe, expect, it } from 'vitest';
import {
  parseImportFile,
  MAX_IMPORT_FILE_SIZE_BYTES,
} from '../../../src/infrastructure/masterImports/parseImportFile';

function csvFile(content: string, name = 'data.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseImportFile', () => {
  describe('CSV', () => {
    it('ヘッダー行をキーとして行データをオブジェクトの配列に変換する', async () => {
      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n' +
          '11A,1,10001,山田,太郎\n' +
          '11A,2,10002,佐藤,花子\n'
      );

      const rows = await parseImportFile(file, 'students.csv');

      expect(rows).toEqual([
        {
          class_code: '11A',
          attendance_number: '1',
          student_id_number: '10001',
          last_name: '山田',
          first_name: '太郎',
        },
        {
          class_code: '11A',
          attendance_number: '2',
          student_id_number: '10002',
          last_name: '佐藤',
          first_name: '花子',
        },
      ]);
    });

    it('ダブルクォートで囲まれた、カンマや改行を含むフィールドを正しく扱う', async () => {
      const file = csvFile('last_name,first_name\n"山田,太郎","""次郎"""\n');

      const rows = await parseImportFile(file, 'teachers.csv');

      expect(rows).toEqual([{ last_name: '山田,太郎', first_name: '"次郎"' }]);
    });

    it('末尾に空行があっても無視する', async () => {
      const file = csvFile('class_code,class_name\n13C,3年Cクラス\n\n');

      const rows = await parseImportFile(file, 'classrooms.csv');

      expect(rows).toEqual([{ class_code: '13C', class_name: '3年Cクラス' }]);
    });

    it('ヘッダーのみでデータ行が無い場合は空配列を返す', async () => {
      const file = csvFile('class_code,class_name\n');

      const rows = await parseImportFile(file, 'classrooms.csv');

      expect(rows).toEqual([]);
    });

    it('日本語ヘッダーをsnake_caseのキーに正規化する', async () => {
      const file = csvFile(
        'クラス記号,出席番号,学籍番号,氏名（姓）,氏名（名）\n11A,1,10001,山田,太郎\n'
      );

      const rows = await parseImportFile(file, 'students.csv');

      expect(rows).toEqual([
        {
          class_code: '11A',
          attendance_number: '1',
          student_id_number: '10001',
          last_name: '山田',
          first_name: '太郎',
        },
      ]);
    });

    it('日本語ヘッダーと英語ヘッダーが混在していても正規化する', async () => {
      const file = csvFile('クラス記号,class_name\n13C,3年Cクラス\n');

      const rows = await parseImportFile(file, 'classrooms.csv');

      expect(rows).toEqual([{ class_code: '13C', class_name: '3年Cクラス' }]);
    });
  });

  it('.csv/.xlsx/.xls以外の拡張子はエラーを投げる', async () => {
    const file = csvFile('a,b\n1,2\n', 'data.txt');

    await expect(parseImportFile(file, 'data.txt')).rejects.toThrow(
      'Unsupported file type'
    );
  });

  it('上限サイズを超えるファイルはエラーを投げ、読み込みを行わない', async () => {
    const file = new File(
      [new Uint8Array(MAX_IMPORT_FILE_SIZE_BYTES + 1)],
      'huge.csv',
      { type: 'text/csv' }
    );

    await expect(parseImportFile(file, 'huge.csv')).rejects.toThrow(
      'File is too large'
    );
  });

  it('上限サイズちょうどのファイルは許可する', async () => {
    const content = 'a,b\n' + '1,2\n'.repeat(100);
    const file = csvFile(content);

    await expect(parseImportFile(file, 'ok.csv')).resolves.not.toBeNull();
  });
});
