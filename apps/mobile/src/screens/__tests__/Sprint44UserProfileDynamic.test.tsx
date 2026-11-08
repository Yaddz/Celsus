import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, waitFor } from '@testing-library/react-native';
import { profileStore } from '../../stores/profileStore';
import { StatisticsScreen } from '../StatisticsScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { SearchAssetsScreen } from '../SearchAssetsScreen';

// Mock dependencies for isolated screen rendering
jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockResolvedValue([]),
    getDefaultPortfolio: jest.fn().mockResolvedValue(null),
    getClassTargets: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/incomeRepository', () => ({
  incomeRepository: {
    listAll: jest.fn().mockResolvedValue([]),
    listByPortfolio: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

jest.mock('../../services/transactionService', () => ({
  transactionService: {
    getTransactionsByPortfolio: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../services/marketApi', () => ({
  marketApiService: {
    searchCatalog: jest.fn().mockResolvedValue([]),
    getQuotes: jest.fn().mockResolvedValue([]),
  },
}));

describe('S44: Dynamic User Profile & Zero Pedro/PL Regression Tests', () => {
  beforeEach(async () => {
    profileStore.setRepository({
      getProfileName: jest.fn().mockResolvedValue('Ana Souza'),
      setProfileName: jest.fn().mockResolvedValue(undefined),
      isOnboarded: jest.fn().mockResolvedValue(true),
      setOnboarded: jest.fn().mockResolvedValue(undefined),
      getProfile: jest.fn().mockResolvedValue({
        name: 'Ana Souza',
        initials: 'AS',
        onboarded: true,
      }),
    } as any);
    await profileStore.load();
  });

  it('S44-T22: Screen headers dynamically display profile name "Ana Souza" and initials "AS" instead of Pedro/PL', async () => {
    // 1. StatisticsScreen
    const statsRender = await render(<StatisticsScreen />);
    expect(statsRender.queryByText('Pedro')).toBeNull();
    expect(statsRender.queryByText('PL')).toBeNull();
    expect(statsRender.getByLabelText(/Abrir perfil de Ana Souza/i)).toBeDefined();
    expect(statsRender.getByText('AS')).toBeDefined();
    statsRender.unmount();

    // 2. PortfolioManagementScreen
    const portRender = await render(<PortfolioManagementScreen />);
    expect(portRender.queryByText('Pedro')).toBeNull();
    expect(portRender.queryByText('PL')).toBeNull();
    expect(portRender.getByLabelText(/Abrir perfil de Ana Souza/i)).toBeDefined();
    expect(portRender.getByText('AS')).toBeDefined();
    portRender.unmount();

    // 3. SearchAssetsScreen
    const searchRender = await render(<SearchAssetsScreen />);
    expect(searchRender.queryByText('Pedro')).toBeNull();
    expect(searchRender.queryByText('PL')).toBeNull();
    expect(searchRender.getByLabelText(/Abrir perfil de Ana Souza/i)).toBeDefined();
    expect(searchRender.getByText('AS')).toBeDefined();
    searchRender.unmount();
  });

  it('S44-T23: Static code audit verifies NO hardcoded userName="Pedro" or userInitials="PL" in production screens', () => {
    const screensDir = path.resolve(__dirname, '..');
    const appFile = path.resolve(__dirname, '../../../App.tsx');

    const filesToAudit: string[] = [appFile];

    function collectSourceFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            collectSourceFiles(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          filesToAudit.push(fullPath);
        }
      }
    }

    collectSourceFiles(screensDir);

    const violations: string[] = [];

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('userName="Pedro"')) {
        violations.push(`${path.basename(filePath)} contains userName="Pedro"`);
      }
      if (content.includes('userInitials="PL"')) {
        violations.push(`${path.basename(filePath)} contains userInitials="PL"`);
      }
    }

    expect(violations).toEqual([]);
  });
});
