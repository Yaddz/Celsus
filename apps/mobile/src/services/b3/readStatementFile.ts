import { unzipSync } from 'fflate';

export class B3ParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmptyFileError extends B3ParsingError {}
export class UnrecognizedFormatError extends B3ParsingError {}
export class MissingColumnError extends B3ParsingError {}
export class UnsupportedStatementError extends B3ParsingError {}

function colLetterToIndex(colStr: string): number {
  let idx = 0;
  for (let i = 0; i < colStr.length; i++) {
    idx = idx * 26 + (colStr.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function excelSerialToDateString(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const date = new Date(utcMs);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const REQUIRED_COLUMNS = [
  'entradaSaida',
  'data',
  'movimentacao',
  'produto',
  'instituicao',
  'quantidade',
  'precoUnitario',
  'valorOperacao',
] as const;

function matchCanonicalKey(header: string): string | null {
  const clean = header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (/entrada.*saida/.test(clean)) return 'entradaSaida';
  if (/^data$/.test(clean)) return 'data';
  if (/movimentaca?o/.test(clean)) return 'movimentacao';
  if (/^produto/.test(clean)) return 'produto';
  if (/instituica?o/.test(clean)) return 'instituicao';
  if (/^quantidade/.test(clean)) return 'quantidade';
  if (/pre[cç]o.*unit[aá]rio/.test(clean)) return 'precoUnitario';
  if (/valor.*opera[cç][aã]o/.test(clean)) return 'valorOperacao';

  return null;
}

function checkUnsupportedFormat(rawHeaders: string[]): void {
  for (const h of rawHeaders) {
    const clean = h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (
      clean.includes('negocio') ||
      clean.includes('codigo de negociacao') ||
      clean.includes('data do negocio')
    ) {
      throw new UnsupportedStatementError(
        'O arquivo selecionado parece ser um relatório de negociação da B3. Por favor, exporte o extrato de Movimentação da B3.'
      );
    }
  }
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function processRawTable(rawTable: string[][]): Array<Record<string, string>> {
  if (rawTable.length === 0) {
    throw new EmptyFileError('O arquivo está vazio.');
  }

  const rawHeaders = rawTable[0].map((h) => h.trim());
  checkUnsupportedFormat(rawHeaders);

  const colMap = new Map<number, string>();
  const foundCanonical = new Set<string>();

  for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
    const key = matchCanonicalKey(rawHeaders[colIdx]);
    if (key) {
      colMap.set(colIdx, key);
      foundCanonical.add(key);
    }
  }

  for (const required of REQUIRED_COLUMNS) {
    if (!foundCanonical.has(required)) {
      throw new MissingColumnError(
        `Arquivo não parece ser o extrato de Movimentação da B3: faltou a coluna ${required}`
      );
    }
  }

  const rows: Array<Record<string, string>> = [];
  for (let r = 1; r < rawTable.length; r++) {
    const rowCells = rawTable[r];
    if (!rowCells || !rowCells.some((c) => c && c.trim().length > 0)) {
      continue;
    }

    const rowObj: Record<string, string> = {};
    for (const [colIdx, key] of colMap.entries()) {
      let val = (rowCells[colIdx] ?? '').trim();
      if (key === 'data') {
        const num = Number(val);
        if (!isNaN(num) && num > 20000 && num < 80000) {
          val = excelSerialToDateString(num);
        }
      }
      rowObj[key] = val;
    }
    rows.push(rowObj);
  }

  if (rows.length === 0) {
    throw new EmptyFileError('Nenhum registro de movimentação encontrado.');
  }

  return rows;
}

export async function readStatementFile(
  fileBytes: Uint8Array,
  fileName: string
): Promise<Array<Record<string, string>>> {
  if (!fileBytes || fileBytes.length === 0) {
    throw new EmptyFileError('Arquivo vazio');
  }

  const lowerName = fileName.toLowerCase();
  const isXlsx = lowerName.endsWith('.xlsx');
  const isCsv = lowerName.endsWith('.csv');

  if (!isXlsx && !isCsv) {
    throw new UnrecognizedFormatError(
      `Formato de arquivo não suportado: ${fileName}. Use arquivos .xlsx ou .csv.`
    );
  }

  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(fileBytes);
    const cleanText = text.replace(/^\uFEFF/, '');
    if (!cleanText.trim()) {
      throw new EmptyFileError('Arquivo CSV vazio');
    }

    const firstNonEmptyLine =
      cleanText.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const semiCount = (firstNonEmptyLine.match(/;/g) || []).length;
    const commaCount = (firstNonEmptyLine.match(/,/g) || []).length;
    const delimiter = semiCount >= commaCount && semiCount > 0 ? ';' : ',';

    const parsedTable = parseCsv(cleanText, delimiter);
    return processRawTable(parsedTable);
  }

  // XLSX handling
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(fileBytes);
  } catch (err) {
    throw new UnrecognizedFormatError('Não foi possível descompactar o arquivo XLSX.');
  }

  let sharedStrings: string[] = [];
  if (unzipped['xl/sharedStrings.xml']) {
    const sstXml = new TextDecoder('utf-8').decode(unzipped['xl/sharedStrings.xml']);
    const siMatches = [...sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)];
    sharedStrings = siMatches.map((m) => {
      const tMatches = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
      return unescapeXml(tMatches.map((tm) => tm[1]).join(''));
    });
  }

  let sheetFileName = 'xl/worksheets/sheet1.xml';
  const sheetKeys = Object.keys(unzipped).filter(
    (k) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml')
  );
  if (sheetKeys.length > 0 && !sheetKeys.includes(sheetFileName)) {
    sheetFileName = sheetKeys[0];
  }

  if (!unzipped[sheetFileName]) {
    throw new UnrecognizedFormatError('Planilha não encontrada dentro do arquivo XLSX.');
  }

  const sheetXml = new TextDecoder('utf-8').decode(unzipped[sheetFileName]);
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];
  if (rowMatches.length === 0) {
    throw new EmptyFileError('Planilha sem linhas.');
  }

  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const rawTable: string[][] = [];

  for (const rm of rowMatches) {
    const rowBody = rm[1];
    const rowCells: string[] = [];
    for (const cm of rowBody.matchAll(cellRegex)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const rMatch = attrs.match(/r="([A-Z]+)(\d+)"/);
      const colIdx = rMatch ? colLetterToIndex(rMatch[1]) : rowCells.length;
      const isShared = /t="s"/.test(attrs);
      const isInline = /t="inlineStr"/.test(attrs);

      let val = '';
      if (isShared) {
        const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const idx = parseInt(vMatch[1], 10);
          val = sharedStrings[idx] ?? '';
        }
      } else if (isInline) {
        const tMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        if (tMatch) {
          val = unescapeXml(tMatch[1]);
        }
      } else {
        const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          val = unescapeXml(vMatch[1]);
        }
      }

      rowCells[colIdx] = val;
    }
    rawTable.push(rowCells);
  }

  return processRawTable(rawTable);
}
