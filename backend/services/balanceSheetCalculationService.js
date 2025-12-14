const BalanceSheet = require('../models/BalanceSheet');
const Sales = require('../models/Sales');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Inventory = require('../models/Inventory');
const Payment = require('../models/Payment');

class BalanceSheetCalculationService {
  constructor() {
    this.periodTypes = {
      monthly: 1,
      quarterly: 3,
      yearly: 12
    };
  }

  // Get basic balance sheet statistics for a period
  async getStats(period = {}) {
    const filter = {};
    if (period.startDate || period.endDate) {
      filter.statementDate = {};
      if (period.startDate) filter.statementDate.$gte = new Date(period.startDate);
      if (period.endDate) filter.statementDate.$lte = new Date(period.endDate);
    }

    const [total, byStatus, latest] = await Promise.all([
      BalanceSheet.countDocuments(filter),
      BalanceSheet.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      BalanceSheet.findOne(filter).sort({ statementDate: -1 })
    ]);

    const statusCounts = byStatus.reduce((acc, s) => {
      acc[s._id || 'unknown'] = s.count;
      return acc;
    }, {});

    const result = {
      total,
      byStatus: statusCounts,
      latestStatementDate: latest?.statementDate || null
    };

    return result;
  }

  // Generate balance sheet for a specific period
  async generateBalanceSheet(statementDate, periodType = 'monthly', generatedBy) {
    try {
      // Ensure statementDate is a Date object
      const date = new Date(statementDate);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid statement date provided');
      }

      // Generate statement number
      const statementNumber = await this.generateStatementNumber(date, periodType);
      
      // Check if balance sheet already exists for this period
      const existingBalanceSheet = await BalanceSheet.findOne({
        statementDate: { $gte: new Date(date.getFullYear(), date.getMonth(), 1) },
        periodType
      });

      if (existingBalanceSheet) {
        throw new Error(`Balance sheet already exists for ${periodType} period ending ${date.toLocaleDateString()}`);
      }

      // Calculate all balance sheet components
      const balanceSheetData = {
        statementNumber,
        statementDate: date,
        periodType,
        status: 'draft',
        assets: await this.calculateAssets(date),
        liabilities: await this.calculateLiabilities(date),
        equity: await this.calculateEquity(date, periodType),
        metadata: {
          generatedBy,
          generatedAt: new Date(),
          version: 1
        },
        auditTrail: [{
          action: 'created',
          performedBy: generatedBy,
          details: `Balance sheet generated for ${periodType} period ending ${date.toLocaleDateString()}`,
          performedAt: new Date()
        }]
      };

      // Create the balance sheet
      const balanceSheet = new BalanceSheet(balanceSheetData);
      
      try {
        await balanceSheet.save();
        console.log(`✅ Balance sheet ${statementNumber} created successfully`);
        return balanceSheet;
      } catch (saveError) {
        console.error('❌ Error saving balance sheet:', saveError);
        console.error('Balance sheet data:', JSON.stringify(balanceSheetData, null, 2));
        throw new Error(`Failed to save balance sheet: ${saveError.message}`);
      }
    } catch (error) {
      console.error('Error generating balance sheet:', error);
      throw error;
    }
  }

  // Generate unique statement number
  async generateStatementNumber(statementDate, periodType) {
    const year = statementDate.getFullYear();
    const month = String(statementDate.getMonth() + 1).padStart(2, '0');
    
    let prefix;
    switch (periodType) {
      case 'monthly':
        prefix = `BS-M${year}${month}`;
        break;
      case 'quarterly':
        const quarter = Math.ceil((statementDate.getMonth() + 1) / 3);
        prefix = `BS-Q${quarter}-${year}`;
        break;
      case 'yearly':
        prefix = `BS-Y${year}`;
        break;
      default:
        prefix = `BS-M${year}${month}`;
    }

    // Find the next sequence number
    const count = await BalanceSheet.countDocuments({
      statementNumber: { $regex: `^${prefix}` }
    });

    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
  }

  // Calculate assets
  async calculateAssets(statementDate) {
    try {
      const cashAndCashEquivalents = await this.calculateCashAndCashEquivalents(statementDate);
      const accountsReceivable = await this.calculateAccountsReceivable(statementDate);
      const inventory = await this.calculateInventory(statementDate);
      const prepaidExpenses = await this.calculatePrepaidExpenses(statementDate);
      const propertyPlantEquipment = await this.calculatePropertyPlantEquipment(statementDate);
      const accumulatedDepreciation = await this.calculateAccumulatedDepreciation(statementDate);
      const intangibleAssets = await this.calculateIntangibleAssets(statementDate);
      const longTermInvestments = await this.calculateLongTermInvestments(statementDate);
      const otherAssets = await this.calculateOtherAssets(statementDate);

      // Calculate totals manually to avoid pre-save middleware issues
      const totalCurrentAssets = 
        cashAndCashEquivalents.total +
        accountsReceivable.netReceivables +
        inventory.total +
        prepaidExpenses +
        0; // otherCurrentAssets

      const netPropertyPlantEquipment = 
        propertyPlantEquipment.total - accumulatedDepreciation;

      const totalFixedAssets = 
        netPropertyPlantEquipment +
        intangibleAssets.total +
        longTermInvestments +
        otherAssets;

      const totalAssets = totalCurrentAssets + totalFixedAssets;

      const assets = {
        currentAssets: {
          cashAndCashEquivalents: {
            ...cashAndCashEquivalents,
            total: cashAndCashEquivalents.total
          },
          accountsReceivable: {
            ...accountsReceivable,
            netReceivables: accountsReceivable.netReceivables
          },
          inventory: {
            ...inventory,
            total: inventory.total
          },
          prepaidExpenses: prepaidExpenses,
          otherCurrentAssets: 0,
          totalCurrentAssets: totalCurrentAssets
        },
        fixedAssets: {
          propertyPlantEquipment: {
            ...propertyPlantEquipment,
            total: propertyPlantEquipment.total
          },
          accumulatedDepreciation: accumulatedDepreciation,
          netPropertyPlantEquipment: netPropertyPlantEquipment,
          intangibleAssets: {
            ...intangibleAssets,
            total: intangibleAssets.total
          },
          longTermInvestments: longTermInvestments,
          otherAssets: otherAssets,
          totalFixedAssets: totalFixedAssets
        },
        totalAssets: totalAssets
      };

      return assets;
    } catch (error) {
      console.error('Error calculating assets:', error);
      throw error;
    }
  }

  // Calculate cash and cash equivalents
  async calculateCashAndCashEquivalents(statementDate) {
    try {
      // Get cash from accounting transactions
      const Transaction = require('../models/Transaction');
      
      // Calculate cash account balance (1001)
      const cashTransactions = await Transaction.find({
        createdAt: { $lte: statementDate },
        accountCode: '1001',
        status: 'completed'
      });

      let cashBalance = 0;
      cashTransactions.forEach(transaction => {
        cashBalance += transaction.debitAmount - transaction.creditAmount;
      });

      // Calculate bank account balance (1002)
      const bankTransactions = await Transaction.find({
        createdAt: { $lte: statementDate },
        accountCode: '1002',
        status: 'completed'
      });

      let bankBalance = 0;
      bankTransactions.forEach(transaction => {
        bankBalance += transaction.debitAmount - transaction.creditAmount;
      });

      return {
        cashOnHand: 0, // Would need to be tracked separately
        bankAccounts: bankBalance,
        pettyCash: cashBalance,
        total: cashBalance + bankBalance
      };
    } catch (error) {
      console.error('Error calculating cash and cash equivalents:', error);
      return { cashOnHand: 0, bankAccounts: 0, pettyCash: 0, total: 0 };
    }
  }

  // Calculate accounts receivable
  async calculateAccountsReceivable(statementDate) {
    try {
      // Get accounts receivable from accounting transactions
      const Transaction = require('../models/Transaction');
      
      const arTransactions = await Transaction.find({
        createdAt: { $lte: statementDate },
        accountCode: '1201', // Accounts Receivable
        status: 'completed'
      });

      let arBalance = 0;
      arTransactions.forEach(transaction => {
        arBalance += transaction.debitAmount - transaction.creditAmount;
      });

      // Allowance for doubtful accounts (typically 2-5% of receivables)
      const allowancePercentage = 0.03; // 3%
      const allowanceForDoubtfulAccounts = Math.max(0, arBalance) * allowancePercentage;

      return {
        tradeReceivables: Math.max(0, arBalance),
        otherReceivables: 0,
        allowanceForDoubtfulAccounts: allowanceForDoubtfulAccounts,
        netReceivables: Math.max(0, arBalance) - allowanceForDoubtfulAccounts
      };
    } catch (error) {
      console.error('Error calculating accounts receivable:', error);
      return {
        tradeReceivables: 0,
        otherReceivables: 0,
        allowanceForDoubtfulAccounts: 0,
        netReceivables: 0
      };
    }
  }

  // Calculate inventory
  async calculateInventory(statementDate) {
    try {
      // Get inventory value from accounting transactions
      const Transaction = require('../models/Transaction');
      
      const inventoryTransactions = await Transaction.find({
        createdAt: { $lte: statementDate },
        accountCode: '1301', // Inventory
        status: 'completed'
      });

      let inventoryBalance = 0;
      inventoryTransactions.forEach(transaction => {
        inventoryBalance += transaction.debitAmount - transaction.creditAmount;
      });

      return {
        rawMaterials: 0,
        workInProgress: 0,
        finishedGoods: Math.max(0, inventoryBalance),
        total: Math.max(0, inventoryBalance)
      };
    } catch (error) {
      console.error('Error calculating inventory:', error);
      return {
        rawMaterials: 0,
        workInProgress: 0,
        finishedGoods: 0,
        total: 0
      };
    }
  }

  // Calculate prepaid expenses
  async calculatePrepaidExpenses(statementDate) {
    // This would typically come from expense tracking
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate property, plant, and equipment
  async calculatePropertyPlantEquipment(statementDate) {
    // This would typically come from asset management system
    // For now, return default values (would need to be configured)
    return {
      land: 0,
      buildings: 0,
      equipment: 0,
      vehicles: 0,
      furnitureAndFixtures: 0,
      computerEquipment: 0,
      total: 0
    };
  }

  // Calculate accumulated depreciation
  async calculateAccumulatedDepreciation(statementDate) {
    // This would typically come from depreciation calculations
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate intangible assets
  async calculateIntangibleAssets(statementDate) {
    // This would typically come from asset management system
    // For now, return default values (would need to be configured)
    return {
      goodwill: 0,
      patents: 0,
      trademarks: 0,
      software: 0,
      total: 0
    };
  }

  // Calculate long-term investments
  async calculateLongTermInvestments(statementDate) {
    // This would typically come from investment tracking
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate other assets
  async calculateOtherAssets(statementDate) {
    // This would typically come from other asset tracking
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate liabilities
  async calculateLiabilities(statementDate) {
    try {
      const accountsPayable = await this.calculateAccountsPayable(statementDate);
      const accruedExpenses = await this.calculateAccruedExpenses(statementDate);
      const shortTermDebt = await this.calculateShortTermDebt(statementDate);
      const deferredRevenue = await this.calculateDeferredRevenue(statementDate);
      const longTermDebt = await this.calculateLongTermDebt(statementDate);
      const deferredTaxLiabilities = await this.calculateDeferredTaxLiabilities(statementDate);
      const pensionLiabilities = await this.calculatePensionLiabilities(statementDate);
      const otherLongTermLiabilities = await this.calculateOtherLongTermLiabilities(statementDate);

      // Calculate totals manually
      const totalCurrentLiabilities = 
        accountsPayable.total +
        accruedExpenses.total +
        shortTermDebt.total +
        deferredRevenue +
        0; // otherCurrentLiabilities

      const totalLongTermLiabilities = 
        longTermDebt.total +
        deferredTaxLiabilities +
        pensionLiabilities +
        otherLongTermLiabilities;

      const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

      const liabilities = {
        currentLiabilities: {
          accountsPayable: {
            ...accountsPayable,
            total: accountsPayable.total
          },
          accruedExpenses: {
            ...accruedExpenses,
            total: accruedExpenses.total
          },
          shortTermDebt: {
            ...shortTermDebt,
            total: shortTermDebt.total
          },
          deferredRevenue: deferredRevenue,
          otherCurrentLiabilities: 0,
          totalCurrentLiabilities: totalCurrentLiabilities
        },
        longTermLiabilities: {
          longTermDebt: {
            ...longTermDebt,
            total: longTermDebt.total
          },
          deferredTaxLiabilities: deferredTaxLiabilities,
          pensionLiabilities: pensionLiabilities,
          otherLongTermLiabilities: otherLongTermLiabilities,
          totalLongTermLiabilities: totalLongTermLiabilities
        },
        totalLiabilities: totalLiabilities
      };

      return liabilities;
    } catch (error) {
      console.error('Error calculating liabilities:', error);
      throw error;
    }
  }

  // Calculate accounts payable
  async calculateAccountsPayable(statementDate) {
    try {
      // Get accounts payable from accounting transactions
      const Transaction = require('../models/Transaction');
      
      const apTransactions = await Transaction.find({
        createdAt: { $lte: statementDate },
        accountCode: '2001', // Accounts Payable
        status: 'completed'
      });

      let apBalance = 0;
      apTransactions.forEach(transaction => {
        apBalance += transaction.creditAmount - transaction.debitAmount;
      });

      return {
        tradePayables: Math.max(0, apBalance),
        otherPayables: 0,
        total: Math.max(0, apBalance)
      };
    } catch (error) {
      console.error('Error calculating accounts payable:', error);
      return {
        tradePayables: 0,
        otherPayables: 0,
        total: 0
      };
    }
  }

  // Calculate accrued expenses
  async calculateAccruedExpenses(statementDate) {
    // This would typically come from expense tracking system
    // For now, return default values (would need to be configured)
    return {
      salariesPayable: 0,
      utilitiesPayable: 0,
      rentPayable: 0,
      taxesPayable: 0,
      interestPayable: 0,
      otherAccruedExpenses: 0,
      total: 0
    };
  }

  // Calculate short-term debt
  async calculateShortTermDebt(statementDate) {
    // This would typically come from debt tracking system
    // For now, return default values (would need to be configured)
    return {
      creditLines: 0,
      shortTermLoans: 0,
      creditCardDebt: 0,
      total: 0
    };
  }

  // Calculate deferred revenue
  async calculateDeferredRevenue(statementDate) {
    try {
      // Get orders that have been paid but not yet delivered
      const deferredOrders = await Sales.find({
        createdAt: { $lte: statementDate },
        status: { $in: ['pending', 'confirmed'] },
        payment: { status: 'completed' }
      });

      let deferredRevenue = 0;
      for (const order of deferredOrders) {
        deferredRevenue += order.total;
      }

      return deferredRevenue;
    } catch (error) {
      console.error('Error calculating deferred revenue:', error);
      return 0;
    }
  }

  // Calculate long-term debt
  async calculateLongTermDebt(statementDate) {
    // This would typically come from debt tracking system
    // For now, return default values (would need to be configured)
    return {
      mortgages: 0,
      longTermLoans: 0,
      bondsPayable: 0,
      total: 0
    };
  }

  // Calculate deferred tax liabilities
  async calculateDeferredTaxLiabilities(statementDate) {
    // This would typically come from tax calculations
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate pension liabilities
  async calculatePensionLiabilities(statementDate) {
    // This would typically come from HR/payroll system
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate other long-term liabilities
  async calculateOtherLongTermLiabilities(statementDate) {
    // This would typically come from other liability tracking
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Calculate equity
  async calculateEquity(statementDate, periodType) {
    try {
      const contributedCapital = await this.calculateContributedCapital(statementDate);
      const retainedEarnings = await this.calculateRetainedEarnings(statementDate, periodType);
      const otherEquity = await this.calculateOtherEquity(statementDate);

      // Calculate total equity manually
      const totalEquity = 
        contributedCapital.total +
        retainedEarnings.endingRetainedEarnings +
        otherEquity.total;

      const equity = {
        contributedCapital: {
          ...contributedCapital,
          total: contributedCapital.total
        },
        retainedEarnings: {
          ...retainedEarnings,
          endingRetainedEarnings: retainedEarnings.endingRetainedEarnings
        },
        otherEquity: {
          ...otherEquity,
          total: otherEquity.total
        },
        totalEquity: totalEquity
      };

      return equity;
    } catch (error) {
      console.error('Error calculating equity:', error);
      throw error;
    }
  }

  // Calculate contributed capital
  async calculateContributedCapital(statementDate) {
    // This would typically come from capital tracking system
    // For now, return default values (would need to be configured)
    return {
      commonStock: 10000, // Default startup capital
      preferredStock: 0,
      additionalPaidInCapital: 0,
      total: 10000
    };
  }

  // Calculate retained earnings
  async calculateRetainedEarnings(statementDate, periodType) {
    try {
      // Get previous period's retained earnings
      const previousPeriod = await this.getPreviousPeriod(statementDate, periodType);
      let beginningRetainedEarnings = 0;

      if (previousPeriod) {
        const previousBalanceSheet = await BalanceSheet.findOne({
          statementDate: previousPeriod,
          periodType
        });
        if (previousBalanceSheet) {
          beginningRetainedEarnings = previousBalanceSheet.equity.retainedEarnings.endingRetainedEarnings;
        }
      }

      // Calculate current period earnings (this would need to be integrated with P&L)
      const currentPeriodEarnings = await this.calculateCurrentPeriodEarnings(statementDate, periodType);

      // Calculate dividends paid (this would need to be tracked)
      const dividendsPaid = await this.calculateDividendsPaid(statementDate, periodType);

      return {
        beginningRetainedEarnings: beginningRetainedEarnings,
        currentPeriodEarnings: currentPeriodEarnings,
        dividendsPaid: dividendsPaid,
        endingRetainedEarnings: beginningRetainedEarnings + currentPeriodEarnings - dividendsPaid
      };
    } catch (error) {
      console.error('Error calculating retained earnings:', error);
      return {
        beginningRetainedEarnings: 0,
        currentPeriodEarnings: 0,
        dividendsPaid: 0,
        endingRetainedEarnings: 0
      };
    }
  }

  // Calculate other equity
  async calculateOtherEquity(statementDate) {
    // This would typically come from equity tracking system
    // For now, return default values (would need to be configured)
    return {
      treasuryStock: 0,
      accumulatedOtherComprehensiveIncome: 0,
      total: 0
    };
  }

  // Get previous period date
  getPreviousPeriod(statementDate, periodType) {
    const date = new Date(statementDate);
    
    switch (periodType) {
      case 'monthly':
        date.setMonth(date.getMonth() - 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() - 3);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() - 1);
        break;
    }
    
    return date;
  }

  // Calculate current period earnings
  async calculateCurrentPeriodEarnings(statementDate, periodType) {
    try {
      // This would typically be integrated with P&L calculation
      // For now, calculate based on orders
      const startDate = this.getPreviousPeriod(statementDate, periodType);
      
      const orders = await Sales.find({
        createdAt: { $gte: startDate, $lte: statementDate },
        orderType: 'sale',
        status: 'completed'
      });

      let totalRevenue = 0;
      let totalCosts = 0;

      for (const order of orders) {
        totalRevenue += order.total;
        
        // Calculate cost of goods sold
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            totalCosts += item.quantity * (product.cost || 0);
          }
        }
      }

      // Simple calculation: Revenue - COGS - Operating Expenses (estimated)
      const grossProfit = totalRevenue - totalCosts;
      const operatingExpenses = totalRevenue * 0.2; // Estimate 20% of revenue as operating expenses
      const netIncome = grossProfit - operatingExpenses;

      return netIncome;
    } catch (error) {
      console.error('Error calculating current period earnings:', error);
      return 0;
    }
  }

  // Calculate dividends paid
  async calculateDividendsPaid(statementDate, periodType) {
    // This would typically come from dividend tracking
    // For now, return 0 (would need to be configured)
    return 0;
  }

  // Get balance sheet comparison data
  async getComparisonData(balanceSheetId, comparisonType = 'previous') {
    try {
      const currentBalanceSheet = await BalanceSheet.findById(balanceSheetId);
      if (!currentBalanceSheet) {
        throw new Error('Balance sheet not found');
      }

      let comparisonBalanceSheet;
      
      switch (comparisonType) {
        case 'previous':
          comparisonBalanceSheet = await BalanceSheet.findOne({
            statementDate: { $lt: currentBalanceSheet.statementDate },
            periodType: currentBalanceSheet.periodType
          }).sort({ statementDate: -1 });
          break;
        case 'year_ago':
          const yearAgo = new Date(currentBalanceSheet.statementDate);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          comparisonBalanceSheet = await BalanceSheet.findOne({
            statementDate: { $gte: yearAgo, $lt: new Date(yearAgo.getTime() + 24 * 60 * 60 * 1000) },
            periodType: currentBalanceSheet.periodType
          });
          break;
        default:
          throw new Error('Invalid comparison type');
      }

      if (!comparisonBalanceSheet) {
        return null;
      }

      return {
        current: currentBalanceSheet,
        comparison: comparisonBalanceSheet,
        changes: this.calculateChanges(currentBalanceSheet, comparisonBalanceSheet)
      };
    } catch (error) {
      console.error('Error getting comparison data:', error);
      throw error;
    }
  }

  // Calculate changes between balance sheets
  calculateChanges(current, comparison) {
    const changes = {};
    
    // Calculate asset changes
    changes.assets = {
      totalAssets: {
        current: current.assets.totalAssets,
        previous: comparison.assets.totalAssets,
        change: current.assets.totalAssets - comparison.assets.totalAssets,
        percentageChange: comparison.assets.totalAssets > 0 ? 
          ((current.assets.totalAssets - comparison.assets.totalAssets) / comparison.assets.totalAssets) * 100 : 0
      }
    };

    // Calculate liability changes
    changes.liabilities = {
      totalLiabilities: {
        current: current.liabilities.totalLiabilities,
        previous: comparison.liabilities.totalLiabilities,
        change: current.liabilities.totalLiabilities - comparison.liabilities.totalLiabilities,
        percentageChange: comparison.liabilities.totalLiabilities > 0 ? 
          ((current.liabilities.totalLiabilities - comparison.liabilities.totalLiabilities) / comparison.liabilities.totalLiabilities) * 100 : 0
      }
    };

    // Calculate equity changes
    changes.equity = {
      totalEquity: {
        current: current.equity.totalEquity,
        previous: comparison.equity.totalEquity,
        change: current.equity.totalEquity - comparison.equity.totalEquity,
        percentageChange: comparison.equity.totalEquity > 0 ? 
          ((current.equity.totalEquity - comparison.equity.totalEquity) / comparison.equity.totalEquity) * 100 : 0
      }
    };

    return changes;
  }
}

module.exports = new BalanceSheetCalculationService();
