import readXlsxFile from 'read-excel-file/universal';

export type ParsedRow = Record<string, unknown>;

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

function rowsToObjects(rows: unknown[][]): ParsedRow[] {
  if (rows.length === 0) {
    return [];
  }
  const headers = rows[0].map(h => String(h ?? '').trim());
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
