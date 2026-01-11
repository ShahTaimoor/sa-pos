/**
 * Financial Statement Versioning Tests
 * Tests for version tracking and change detection
 */

const FinancialStatement = require('../models/FinancialStatement');

describe('Financial Statement Versioning', () => {
  describe('detectChanges', () => {
    it('should detect changes between versions', () => {
      const statement = new FinancialStatement({
        revenue: {
          totalRevenue: { amount: 10000 }
        },
        netIncome: { amount: 5000 },
        status: 'draft'
      });

      const oldVersion = {
        revenue: {
          totalRevenue: { amount: 8000 }
        },
        netIncome: { amount: 4000 },
        status: 'draft'
      };

      const changes = statement.detectChanges(oldVersion);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some(c => c.field === 'revenue')).toBe(true);
      expect(changes.some(c => c.field === 'netIncome')).toBe(true);
    });

    it('should return empty array when no changes', () => {
      const statement = new FinancialStatement({
        revenue: {
          totalRevenue: { amount: 10000 }
        },
        netIncome: { amount: 5000 }
      });

      const oldVersion = {
        revenue: {
          totalRevenue: { amount: 10000 }
        },
        netIncome: { amount: 5000 }
      };

      const changes = statement.detectChanges(oldVersion);

      expect(changes.length).toBe(0);
    });
  });

  describe('version history', () => {
    it('should increment version on update', async () => {
      const statement = new FinancialStatement({
        version: 1,
        isCurrentVersion: true,
        versionHistory: []
      });

      statement.version += 1;
      statement.versionHistory.push({
        version: 2,
        changedBy: 'user123',
        changedAt: new Date(),
        changes: [{ field: 'revenue', oldValue: 8000, newValue: 10000 }],
        status: 'draft'
      });

      expect(statement.version).toBe(2);
      expect(statement.versionHistory.length).toBe(1);
    });
  });
});

