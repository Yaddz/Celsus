// STUB (Sprint 91, Fase A). A implementação vem na Fase B.
export const pluggyClassificationService = {
  async reclassifyOpenFinanceEntries(): Promise<{
    ran: boolean;
    changed: number;
    byReason: Record<string, number>;
  }> {
    return { ran: false, changed: 0, byReason: {} };
  },
  async pairOwnTransfersAcrossItems(): Promise<{ paired: number; topups: number }> {
    return { paired: 0, topups: 0 };
  },
};
