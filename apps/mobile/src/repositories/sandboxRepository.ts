export interface TimeMachineLegSpec {
  id?: string;
  ticker: string;
  assetClass: string;
  investedBRL?: number;
  quantity?: number;
  buyDate: string;
  sellDate: string;
  feesBRL?: number;
}

export interface TimeMachineScenarioSpec {
  legs: TimeMachineLegSpec[];
  options: {
    reinvestDividends: boolean;
    taxEnabled: boolean;
  };
}

export interface SandboxScenarioRecord {
  id: string;
  name: string;
  kind: 'time_machine';
  spec_json: string;
  created_at: string;
  updated_at: string;
}

export const sandboxRepository = {
  async listScenarios(_kind?: string): Promise<SandboxScenarioRecord[]> {
    throw new Error('Not implemented');
  },
  async getScenarioById(_id: string): Promise<SandboxScenarioRecord | null> {
    throw new Error('Not implemented');
  },
  async saveScenario(_input: {
    id?: string;
    name: string;
    kind?: 'time_machine';
    spec: TimeMachineScenarioSpec;
  }): Promise<SandboxScenarioRecord> {
    throw new Error('Not implemented');
  },
  async deleteScenario(_id: string): Promise<void> {
    throw new Error('Not implemented');
  },
};
