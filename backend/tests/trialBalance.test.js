/**
 * Trial Balance Service Tests
 * Tests for trial balance generation and validation
 */

const trialBalanceService = require('../services/trialBalanceService');
const AccountingService = require('../services/accountingService');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');

// Mock dependencies
jest.mock('../services/accountingService');
jest.mock('../repositories/ChartOfAccountsRepository');

describe('TrialBalanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTrialBalance', () => {
    it('should generate balanced trial balance', async () => {
      const mockAccounts = [
        {
          _id: 'acc1',
          accountCode: '1001',
          accountName: 'Cash',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          isActive: true
        },
        {
          _id: 'acc2',
          accountCode: '4001',
          accountName: 'Sales Revenue',
          accountType: 'revenue',
          accountCategory: 'sales_revenue',
          normalBalance: 'credit',
          isActive: true
        }
      ];

      ChartOfAccountsRepository.findAll.mockResolvedValue(mockAccounts);
      AccountingService.getAccountBalance
        .mockResolvedValueOnce(1000) // Cash balance
        .mockResolvedValueOnce(-1000); // Sales Revenue balance (credit)

      const result = await trialBalanceService.generateTrialBalance(new Date());

      expect(result.isBalanced).toBe(true);
      expect(result.totals.totalDebits).toBe(1000);
      expect(result.totals.totalCredits).toBe(1000);
      expect(result.totals.difference).toBe(0);
    });

    it('should detect unbalanced trial balance', async () => {
      const mockAccounts = [
        {
          _id: 'acc1',
          accountCode: '1001',
          accountName: 'Cash',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          isActive: true
        }
      ];

      ChartOfAccountsRepository.findAll.mockResolvedValue(mockAccounts);
      AccountingService.getAccountBalance.mockResolvedValue(1000);

      const result = await trialBalanceService.generateTrialBalance(new Date());

      expect(result.isBalanced).toBe(false);
      expect(result.totals.difference).toBeGreaterThan(0);
    });
  });

  describe('validateTrialBalance', () => {
    it('should validate balanced trial balance', async () => {
      const mockAccounts = [
        {
          _id: 'acc1',
          accountCode: '1001',
          accountName: 'Cash',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          isActive: true
        },
        {
          _id: 'acc2',
          accountCode: '4001',
          accountName: 'Sales Revenue',
          accountType: 'revenue',
          accountCategory: 'sales_revenue',
          normalBalance: 'credit',
          isActive: true
        }
      ];

      ChartOfAccountsRepository.findAll.mockResolvedValue(mockAccounts);
      AccountingService.getAccountBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(-1000);

      const result = await trialBalanceService.validateTrialBalance(new Date(), 'period1');

      expect(result.valid).toBe(true);
      expect(result.message).toContain('valid');
    });

    it('should throw error for unbalanced trial balance', async () => {
      const mockAccounts = [
        {
          _id: 'acc1',
          accountCode: '1001',
          accountName: 'Cash',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          isActive: true
        }
      ];

      ChartOfAccountsRepository.findAll.mockResolvedValue(mockAccounts);
      AccountingService.getAccountBalance.mockResolvedValue(1000);

      await expect(
        trialBalanceService.validateTrialBalance(new Date(), 'period1')
      ).rejects.toThrow('unbalanced');
    });
  });

  describe('getTrialBalanceSummary', () => {
    it('should generate summary by account type', async () => {
      const mockAccounts = [
        {
          _id: 'acc1',
          accountCode: '1001',
          accountName: 'Cash',
          accountType: 'asset',
          accountCategory: 'current_assets',
          normalBalance: 'debit',
          isActive: true
        },
        {
          _id: 'acc2',
          accountCode: '4001',
          accountName: 'Sales Revenue',
          accountType: 'revenue',
          accountCategory: 'sales_revenue',
          normalBalance: 'credit',
          isActive: true
        }
      ];

      ChartOfAccountsRepository.findAll.mockResolvedValue(mockAccounts);
      AccountingService.getAccountBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(-1000);

      const result = await trialBalanceService.getTrialBalanceSummary(new Date());

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.isBalanced).toBe(true);
    });
  });
});

