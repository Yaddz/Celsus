import { File } from 'expo-file-system';

/**
 * Sprint 94: lê os bytes de um arquivo escolhido no seletor (URI file:// ou content://)
 * pela API nova do expo-file-system (`File.bytes()`). No SDK 58, `readAsStringAsync`
 * do import principal lança erro em runtime.
 */
export async function readPickedFileBytes(uri: string): Promise<Uint8Array> {
  return await new File(uri).bytes();
}
