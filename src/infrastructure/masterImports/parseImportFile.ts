import readXlsxFile from 'read-excel-file/universal';

export type ParsedRow = Record<string, unknown>;

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // CRLF改行の\rは無視し、後続の\nでpushRowする
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// Header row may use either the API's snake_case field names or the
// Japanese labels shown in the UI (recwatch's MASTER_IMPORT_COLUMN_LABEL).
// Anything not listed here passes through unchanged.
const HEADER_ALIASES: Record<string, string> = {
  クラス記号: 'class_code',
  出席番号: 'attendance_number',
  学籍番号: 'student_id_number',
  '氏名（姓）': 'last_name',
  '氏名（名）': 'first_name',
};

function normalizeHeader(header: string): string {
  return HEADER_ALIASES[header] ?? header;
}

function rowsToObjects(rows: unknown[][]): ParsedRow[] {
  if (rows.length === 0) {
    return [];
  }
  const headers = rows[0].map(h => normalizeHeader(String(h ?? '').trim()));
  return rows.slice(1).map(row => {
    const obj: ParsedRow = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index] ?? '';
      }
    });
    return obj;
  });
}

export async function parseImportFile(
  file: Blob,
  filename: string
): Promise<ParsedRow[]> {
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error(
      `File is too large: ${file.size} bytes (max ${MAX_IMPORT_FILE_SIZE_BYTES} bytes)`
    );
  }

  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    return rowsToObjects(parseCsvText(text));
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const sheets = await readXlsxFile(file);
    const rows = sheets[0]?.data ?? [];
    return rowsToObjects(rows);
  }

  throw new Error(
    'Unsupported file type: only .csv, .xlsx and .xls are supported'
  );
}
