/**
 * Closing Entries Service Tests
 * Tests for closing entries automation
 */

const closingEntriesService = require('../services/closingEntriesService');
const AccountingPeriod = require('../models/AccountingPeriod');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const AccountingService = require('../services/accountingService');
const JournalVoucher = require('../models/JournalVoucher');

// Mock dependencies
jest.mock('../models/AccountingPeriod');
jest.mock('../repositories/ChartOfAccountsRepository');
jest.mock('../services/accountingService');
jest.mock('../models/JournalVoucher');

describe('ClosingEntriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateClosingEntries', () => {
    it('should generate closing entries for revenue and expense accounts', async () => {
      const mockPeriod = {
        _id: 'period1',
        periodName: 'January 2024',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      };

      const mockRevenueAccounts = [
        {
          _id: 'rev1',
          accountCode: '4001',
          accountName: 'Sales Revenue',
          accountType: 'revenue',
          isActive: true
        }
      ];

      const mockExpenseAccounts = [
        {
          _id: 'exp1',
          accountCode: '5001',
          accountName: 'Cost of Goods Sold',
          accountType: 'expense',
          isActive: true
        }
      ];

      AccountingPeriod.findById.mockResolvedValue(mockPeriod);
      ChartOfAccountsRepository.findAll
        .mockResolvedValueOnce(mockRevenueAccounts)
        .mockResolvedValueOnce(mockExpenseAccounts);

      AccountingService.getAccountBalance
        .mockResolvedValueOnce(10000) // Revenue balance
        .mockResolvedValueOnce(-5000); // Expense balance

      AccountingService.getAccountCode.mockResolvedValue('3001'); // Retained Earnings

      const mockRetainedEarnings = {
        _id: 're1',
        accountCode: '3001',
        accountName: 'Retained Earnings'
      };
      ChartOfAccountsRepository.findOne.mockResolvedValue(mockRetainedEarnings);

      const mockVoucher = {
        _id: 'voucher1',
        voucherNumber: 'JV-CLOSE-000001',
        save: jest.fn().mockResolvedValue(true)
      };
      JournalVoucher.mockImplementation(() => mockVoucher);

      ChartOfAccountsRepository.updateBalance.mockResolvedValue(true);

      const result = await closingEntriesService.generateClosingEntries('period1', 'user1');

      expect(result.message).toContain('successfully');
      expect(result.closingVoucher).toBeDefined();
      expect(result.summary.netIncome).toBe(5000); // 10000 - 5000
    });

    it('should return message when no closing entries required', async () => {
      const mockPeriod = {
        _id: 'period1',
        periodName: 'January 2024',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      };

      AccountingPeriod.findById.mockResolvedValue(mockPeriod);
      ChartOfAccountsRepository.findAll
        .mockResolvedValueOnce([]) // No revenue accounts
        .mockResolvedValueOnce([]); // No expense accounts

      const result = await closingEntriesService.generateClosingEntries('period1', 'user1');

      expect(result.message).toContain('No closing entries required');
    });
  });

  describe('areClosingEntriesRequired', () => {
    it('should return true when accounts have balances', async () => {
      const mockPeriod = {
        _id: 'period1',
        periodName: 'January 2024',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      };

      const mockRevenueAccounts = [
        {
          _id: 'rev1',
          accountCode: '4001',
          accountName: 'Sales Revenue',
          accountType: 'revenue',
          isActive: true
        }
      ];

      AccountingPeriod.findById.mockResolvedValue(mockPeriod);
      JournalVoucher.findOne.mockResolvedValue(null); // No existing closing entries
      ChartOfAccountsRepository.findAll
        .mockResolvedValueOnce(mockRevenueAccounts)
        .mockResolvedValueOnce([]);

      AccountingService.getAccountBalance.mockResolvedValue(1000); // Has balance

      const result = await closingEntriesService.areClosingEntriesRequired('period1');

      expect(result).toBe(true);
    });

    it('should return false when no balances exist', async () => {
      const mockPeriod = {
        _id: 'period1',
        periodName: 'January 2024',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      };

      AccountingPeriod.findById.mockResolvedValue(mockPeriod);
      JournalVoucher.findOne.mockResolvedValue(null);
      ChartOfAccountsRepository.findAll
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await closingEntriesService.areClosingEntriesRequired('period1');

      expect(result).toBe(false);
    });

    it('should return false when closing entries already exist', async () => {
      const mockPeriod = {
        _id: 'period1',
        periodName: 'January 2024',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31')
      };

      AccountingPeriod.findById.mockResolvedValue(mockPeriod);
      JournalVoucher.findOne.mockResolvedValue({ _id: 'existing' }); // Closing entries exist

      const result = await closingEntriesService.areClosingEntriesRequired('period1');

      expect(result).toBe(false);
    });
  });
});

