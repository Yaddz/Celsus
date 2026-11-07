import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';
import {
  InMemorySecureStorage,
  WebSecureStorage,
  ExpoSecureStorage,
  getSecureStorage,
  setSecureStorageProvider,
} from '../secureStorage';

describe('S42: SecureStorage Services', () => {
  beforeEach(() => {
    setSecureStorageProvider(null);
  });

  describe('InMemorySecureStorage', () => {
    it('S42-T02: should set, get, overwrite and delete items correctly in memory', async () => {
      const storage = new InMemorySecureStorage();
      expect(await storage.getItem('key1')).toBeNull();

      await storage.setItem('key1', 'val1');
      expect(await storage.getItem('key1')).toBe('val1');

      await storage.setItem('key1', 'val2');
      expect(await storage.getItem('key1')).toBe('val2');

      await storage.deleteItem('key1');
      expect(await storage.getItem('key1')).toBeNull();
    });
  });

  describe('WebSecureStorage', () => {
    const originalLocalStorage = (global as any).localStorage;

    beforeEach(() => {
      const mockStorage: Record<string, string> = {};
      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: jest.fn((k: string) => mockStorage[k] ?? null),
          setItem: jest.fn((k: string, v: string) => {
            mockStorage[k] = v;
          }),
          removeItem: jest.fn((k: string) => {
            delete mockStorage[k];
          }),
        },
        writable: true,
        configurable: true,
      });
    });

    afterAll(() => {
      Object.defineProperty(global, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('S42-T03: should use localStorage and issue a console.warn on setItem', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const storage = new WebSecureStorage();

      await storage.setItem('token', 'abc');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WebSecureStorage]')
      );
      expect(await storage.getItem('token')).toBe('abc');

      await storage.deleteItem('token');
      expect(await storage.getItem('token')).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('ExpoSecureStorage', () => {
    it('S42-T04: should delegate get, set and delete to expo-secure-store', async () => {
      const storage = new ExpoSecureStorage();

      await storage.setItem('secret', '123456');
      expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith('secret', '123456');

      const val = await storage.getItem('secret');
      expect(ExpoSecureStore.getItemAsync).toHaveBeenCalledWith('secret');
      expect(val).toBe('123456');

      await storage.deleteItem('secret');
      expect(ExpoSecureStore.deleteItemAsync).toHaveBeenCalledWith('secret');
    });
  });

  describe('Storage Selection & Injection', () => {
    it('S42-T05: should select appropriate provider based on Platform.OS or override', () => {
      const defaultStorage = getSecureStorage();
      if (Platform.OS === 'web') {
        expect(defaultStorage).toBeInstanceOf(WebSecureStorage);
      } else {
        expect(defaultStorage).toBeInstanceOf(ExpoSecureStorage);
      }

      const memoryStorage = new InMemorySecureStorage();
      setSecureStorageProvider(memoryStorage);
      expect(getSecureStorage()).toBe(memoryStorage);
    });
  });
});
