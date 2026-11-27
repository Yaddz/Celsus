import type { IMarketApiService } from './marketApi';
import type { SandboxScenarioResult } from '../domain/sandbox/backtest';
import type { TimeMachineScenarioSpec } from '../repositories/sandboxRepository';

export class SandboxService {
  constructor(_marketApi?: IMarketApiService) {}

  clearCache(): void {
    throw new Error('Not implemented');
  }

  async runTimeMachine(_spec: TimeMachineScenarioSpec): Promise<SandboxScenarioResult> {
    throw new Error('Not implemented');
  }
}

export const sandboxService = new SandboxService();
