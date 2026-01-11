/**
 * Account Reconciliation Locking Tests
 * Tests for reconciliation locking mechanism
 */

const ChartOfAccounts = require('../models/ChartOfAccounts');

describe('Account Reconciliation Locking', () => {
  describe('lockForReconciliation', () => {
    it('should lock account for reconciliation', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        reconciliationStatus: {
          status: 'not_started'
        }
      });

      account.save = jest.fn().mockResolvedValue(account);

      await account.lockForReconciliation('user123', 30);

      expect(account.reconciliationStatus.status).toBe('in_progress');
      expect(account.reconciliationStatus.lockedBy.toString()).toBe('user123');
      expect(account.reconciliationStatus.lockedAt).toBeDefined();
      expect(account.reconciliationStatus.lockExpiresAt).toBeDefined();
    });

    it('should throw error if account already locked', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        reconciliationStatus: {
          status: 'in_progress',
          lockedBy: 'user456',
          lockExpiresAt: new Date(Date.now() + 30 * 60000) // 30 minutes from now
        }
      });

      await expect(
        account.lockForReconciliation('user123', 30)
      ).rejects.toThrow('already locked');
    });
  });

  describe('unlockAfterReconciliation', () => {
    it('should unlock account after reconciliation', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        reconciliationStatus: {
          status: 'in_progress',
          lockedBy: 'user123',
          lockedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + 30 * 60000)
        }
      });

      account.save = jest.fn().mockResolvedValue(account);

      await account.unlockAfterReconciliation('user123', true);

      expect(account.reconciliationStatus.status).toBe('reconciled');
      expect(account.reconciliationStatus.reconciledBy.toString()).toBe('user123');
      expect(account.reconciliationStatus.reconciledAt).toBeDefined();
      expect(account.reconciliationStatus.lockedBy).toBeNull();
    });

    it('should throw error if different user tries to unlock', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        reconciliationStatus: {
          status: 'in_progress',
          lockedBy: 'user123',
          lockedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + 30 * 60000)
        }
      });

      await expect(
        account.unlockAfterReconciliation('user456', true)
      ).rejects.toThrow('Only the user who locked');
    });
  });

  describe('updateBalance during reconciliation', () => {
    it('should prevent balance update during reconciliation', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        currentBalance: 1000,
        normalBalance: 'debit',
        reconciliationStatus: {
          status: 'in_progress',
          lockedBy: 'user123',
          lockedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + 30 * 60000)
        }
      });

      await expect(
        account.updateBalance(100, true)
      ).rejects.toThrow('during reconciliation');
    });

    it('should allow balance update when not locked', async () => {
      const account = new ChartOfAccounts({
        accountCode: '1001',
        accountName: 'Cash',
        currentBalance: 1000,
        normalBalance: 'debit',
        reconciliationStatus: {
          status: 'not_started'
        }
      });

      account.save = jest.fn().mockResolvedValue(account);

      await account.updateBalance(100, true);

      expect(account.currentBalance).toBe(1100);
    });
  });
});

