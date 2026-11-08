export class B3ParsingError extends Error {}
export class EmptyFileError extends B3ParsingError {}
export class UnrecognizedFormatError extends B3ParsingError {}
export class MissingColumnError extends B3ParsingError {}
export class UnsupportedStatementError extends B3ParsingError {}

export async function readStatementFile(
  fileBytes: Uint8Array,
  fileName: string
): Promise<Array<Record<string, string>>> {
  throw new Error('Not implemented');
}
