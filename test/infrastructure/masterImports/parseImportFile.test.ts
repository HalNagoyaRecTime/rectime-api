import { describe, expect, it } from 'vitest';
import { parseImportFile } from '../../../src/infrastructure/masterImports/parseImportFile';

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
  });

  it('.csv/.xlsx/.xls以外の拡張子はエラーを投げる', async () => {
    const file = csvFile('a,b\n1,2\n', 'data.txt');

    await expect(parseImportFile(file, 'data.txt')).rejects.toThrow(
      'Unsupported file type'
    );
  });
});
