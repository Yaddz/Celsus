import React from 'react';
import { View } from 'react-native';
import type {
  InvestmentReconciliationChoice,
  InvestmentReconciliationProposal,
} from '../services/pluggy/pluggyInvestmentsSyncService';
import type { ClassCoverageStatus } from '../domain/openFinance/investments';

export interface OpenFinanceInvestmentReconciliationSheetProps {
  visible: boolean;
  institutionName: string;
  proposals: InvestmentReconciliationProposal[];
  existingAssets: Array<{ id: string; ticker: string; name: string; assetClass: string }>;
  portfolios: Array<{ id: string; name: string }>;
  coverageByClass?: ClassCoverageStatus[];
  onConfirm: (choices: InvestmentReconciliationChoice[]) => void;
  onClose: () => void;
}

export const OpenFinanceInvestmentReconciliationSheet: React.FC<
  OpenFinanceInvestmentReconciliationSheetProps
> = () => {
  return React.createElement(View, { testID: 'of-inv-reconciliation-stub' });
};
