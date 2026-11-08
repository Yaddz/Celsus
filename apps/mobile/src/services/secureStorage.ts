import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/**
 * Garante que a chave obedeça às restrições estritas do Expo SecureStore:
 * apenas caracteres alfanuméricos, '.', '-' e '_'.
 * Converte ':' (muito comum em namespaces como 'auth:pin') em '.'
 * e qualquer outro caractere inválido em '_'.
 */
export function sanitizeSecureStoreKey(key: string): string {
  if (!key) {
    throw new Error('SecureStore key must not be empty');
  }
  return key.replace(/[:/]/g, '.').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class InMemorySecureStorage implements SecureStorage {
  private map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    const k = sanitizeSecureStoreKey(key);
    return this.map.has(k) ? this.map.get(k)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const k = sanitizeSecureStoreKey(key);
    this.map.set(k, value);
  }

  async deleteItem(key: string): Promise<void> {
    const k = sanitizeSecureStoreKey(key);
    this.map.delete(k);
  }
}

export class WebSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    const k = sanitizeSecureStoreKey(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(k);
    }
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    console.warn('[WebSecureStorage] Armazenando chave no localStorage em ambiente web/dev (não seguro).');
    const k = sanitizeSecureStoreKey(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(k, value);
    }
  }

  async deleteItem(key: string): Promise<void> {
    const k = sanitizeSecureStoreKey(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(k);
    }
  }
}

export class ExpoSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return ExpoSecureStore.getItemAsync(sanitizeSecureStoreKey(key));
  }

  async setItem(key: string, value: string): Promise<void> {
    await ExpoSecureStore.setItemAsync(sanitizeSecureStoreKey(key), value);
  }

  async deleteItem(key: string): Promise<void> {
    await ExpoSecureStore.deleteItemAsync(sanitizeSecureStoreKey(key));
  }
}

let activeSecureStorage: SecureStorage | null = null;

export function getSecureStorage(): SecureStorage {
  if (activeSecureStorage) return activeSecureStorage;
  if (Platform.OS === 'web') {
    return new WebSecureStorage();
  }
  return new ExpoSecureStorage();
}

export function setSecureStorageProvider(provider: SecureStorage | null): void {
  activeSecureStorage = provider;
}
