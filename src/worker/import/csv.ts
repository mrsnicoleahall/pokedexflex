/**
 * Minimal, dependency-free RFC4180-ish CSV parser.
 *
 * Rules implemented:
 * - Fields are comma-separated.
 * - A field may be wrapped in double quotes; a doubled quote (`""`) inside a
 *   quoted field is a literal `"`.
 * - Quoted fields may contain commas and newlines (both `\n` and `\r\n`).
 * - Rows are separated by `\n` or `\r\n`.
 * - A single trailing blank line (from a final newline in the source text)
 *   is ignored rather than turned into an empty row.
 *
 * Pure: no I/O, no globals besides the input string.
 */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\r") {
      // Treat \r\n as a single row separator; a lone \r is also treated as one.
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Flush the final field/row unless the input ended cleanly on a row
  // boundary (i.e. there's nothing pending) — this is what makes a trailing
  // newline not produce a spurious empty trailing row.
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
};
