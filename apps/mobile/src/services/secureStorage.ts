import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export class InMemorySecureStorage implements SecureStorage {
  private map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class WebSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    console.warn('[WebSecureStorage] Armazenando chave no localStorage em ambiente web/dev (não seguro).');
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  }

  async deleteItem(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  }
}

export class ExpoSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return ExpoSecureStore.getItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await ExpoSecureStore.setItemAsync(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await ExpoSecureStore.deleteItemAsync(key);
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
