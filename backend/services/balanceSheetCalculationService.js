const BalanceSheetRepository = require('../repositories/BalanceSheetRepository');
const SalesRepository = require('../repositories/SalesRepository');
const ProductRepository = require('../repositories/ProductRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const InventoryRepository = require('../repositories/InventoryRepository');
const PaymentRepository = require('../repositories/PaymentRepository');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const TransactionRepository = require('../repositories/TransactionRepository');
const FinancialStatementRepository = require('../repositories/FinancialStatementRepository');
const AccountingService = require('./accountingService');
const BalanceSheet = require('../models/BalanceSheet'); // Keep for model instance methods
const logger = require('../utils/logger');

class BalanceSheetCalculationService {
  constructor() {
    this.periodTypes = {
      monthly: 1,
      quarterly: 3,
      yearly: 12
    };
    this.accountCodes = null; // Cache for account codes
  }

  // Get account codes dynamically (similar to P&L service)
  async getAccountCodes(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getAccountCodes');
    }
    // Cache per tenant to avoid cross-tenant data leakage
    const cacheKey = `accountCodes_${tenantId}`;
    if (this[cacheKey]) {
      return this[cacheKey];
    }
    this[cacheKey] = await AccountingService.getDefaultAccountCodes(tenantId);
    return this[cacheKey];
  }

  // Get basic balance sheet statistics for a period
  async getStats(period = {}, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getStats');
    }
    const filter = { tenantId }; // CRITICAL: Always include tenantId
    if (period.startDate || period.endDate) {
      filter.statementDate = {};
      if (period.startDate) filter.statementDate.$gte = new Date(period.startDate);
      if (period.endDate) filter.statementDate.$lte = new Date(period.endDate);
    }

    const [total, byStatus, latest] = await Promise.all([
      BalanceSheetRepository.count(filter),
      BalanceSheetRepository.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      BalanceSheetRepository.findOne(filter, { sort: { statementDate: -1 } })
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
  async generateBalanceSheet(statementDate, periodType = 'monthly', generatedBy, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for generateBalanceSheet');
    }
    try {
      // Ensure statementDate is a Date object
      const date = new Date(statementDate);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid statement date provided');
      }

      // Generate statement number
      const statementNumber = await this.generateStatementNumber(date, periodType, tenantId);
      
      // Check if balance sheet already exists for this period
      const existingBalanceSheet = await BalanceSheetRepository.findOne({
        tenantId,
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
        tenantId, // CRITICAL: Include tenantId
        status: 'draft',
        assets: await this.calculateAssets(date, tenantId),
        liabilities: await this.calculateLiabilities(date, tenantId),
        equity: await this.calculateEquity(date, periodType, tenantId),
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
        logger.info(`✅ Balance sheet ${statementNumber} created successfully`);
        return balanceSheet;
      } catch (saveError) {
        logger.error('❌ Error saving balance sheet:', saveError);
        logger.error('Balance sheet data:', JSON.stringify(balanceSheetData, null, 2));
        throw new Error(`Failed to save balance sheet: ${saveError.message}`);
      }
    } catch (error) {
      logger.error('Error generating balance sheet:', error);
      throw error;
    }
  }

  // Generate unique statement number
  async generateStatementNumber(statementDate, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for generateStatementNumber');
    }
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

    // Find all existing statement numbers with this prefix (tenant-scoped)
    const existingSheets = await BalanceSheetRepository.findAll({
      tenantId,
      statementNumber: { $regex: `^${prefix}-` }
    }, {
      select: 'statementNumber',
      lean: true
    });

    // Extract sequence numbers and find the maximum
    let maxSequence = 0;
    const sequenceRegex = new RegExp(`^${prefix}-(\\d+)$`);
    
    existingSheets.forEach(sheet => {
      const match = sheet.statementNumber.match(sequenceRegex);
      if (match) {
        const sequence = parseInt(match[1], 10);
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    });

    // Generate next sequence number
    const nextSequence = maxSequence + 1;
    const statementNumber = `${prefix}-${String(nextSequence).padStart(3, '0')}`;

    // Double-check that this number doesn't exist (safety check, tenant-scoped)
    const exists = await BalanceSheetRepository.findOne({ tenantId, statementNumber });
    if (exists) {
      // If it exists, try incrementing until we find a free number
      let attemptSequence = nextSequence + 1;
      let attemptNumber = `${prefix}-${String(attemptSequence).padStart(3, '0')}`;
      while (await BalanceSheetRepository.findOne({ tenantId, statementNumber: attemptNumber })) {
        attemptSequence++;
        attemptNumber = `${prefix}-${String(attemptSequence).padStart(3, '0')}`;
      }
      return attemptNumber;
    }

    return statementNumber;
  }

  // Calculate assets
  async calculateAssets(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAssets');
    }
    try {
      const cashAndCashEquivalents = await this.calculateCashAndCashEquivalents(statementDate, tenantId);
      const accountsReceivable = await this.calculateAccountsReceivable(statementDate, tenantId);
      const inventory = await this.calculateInventory(statementDate, tenantId);
      const prepaidExpenses = await this.calculatePrepaidExpenses(statementDate, tenantId);
      const propertyPlantEquipment = await this.calculatePropertyPlantEquipment(statementDate, tenantId);
      const accumulatedDepreciation = await this.calculateAccumulatedDepreciation(statementDate, tenantId);
      const intangibleAssets = await this.calculateIntangibleAssets(statementDate, tenantId);
      const longTermInvestments = await this.calculateLongTermInvestments(statementDate, tenantId);
      const otherAssets = await this.calculateOtherAssets(statementDate, tenantId);

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
      logger.error('Error calculating assets:', error);
      throw error;
    }
  }

  // Calculate cash and cash equivalents
  async calculateCashAndCashEquivalents(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateCashAndCashEquivalents');
    }
    try {
      // Get account codes dynamically
      const accountCodes = await this.getAccountCodes(tenantId);
      
      // Calculate cash account balance (dynamic lookup)
      const cashAccountCode = accountCodes.cash || '1001';
      const cashBalance = await this.calculateAccountBalance(cashAccountCode, statementDate, tenantId);

      // Calculate bank account balance (dynamic lookup)
      const bankAccountCode = accountCodes.bank || '1002';
      const bankBalance = await this.calculateAccountBalance(bankAccountCode, statementDate, tenantId);

      // Try to find separate cash on hand account
      const cashOnHandAccount = await ChartOfAccountsRepository.findOne({
        tenantId,
        accountName: { $regex: /cash.*hand|petty.*cash/i },
        accountType: 'asset',
        accountCategory: 'current_assets',
        isActive: true
      });

      let cashOnHand = 0;
      let pettyCash = 0;

      if (cashOnHandAccount) {
        cashOnHand = await this.calculateAccountBalance(cashOnHandAccount.accountCode, statementDate, tenantId);
      } else {
        // If no separate account, use cash balance for cash on hand
        cashOnHand = Math.max(0, cashBalance);
      }

      // Petty cash might be in a separate account or part of cash
      const pettyCashAccount = await ChartOfAccountsRepository.findOne({
        tenantId,
        accountName: { $regex: /petty.*cash/i },
        accountType: 'asset',
        accountCategory: 'current_assets',
        isActive: true
      });

      if (pettyCashAccount && pettyCashAccount.accountCode !== cashOnHandAccount?.accountCode) {
        pettyCash = await this.calculateAccountBalance(pettyCashAccount.accountCode, statementDate, tenantId);
      }

      return {
        cashOnHand: cashOnHand,
        bankAccounts: Math.max(0, bankBalance),
        pettyCash: pettyCash,
        total: cashOnHand + Math.max(0, bankBalance) + pettyCash
      };
    } catch (error) {
      logger.error('Error calculating cash and cash equivalents:', error);
      return { cashOnHand: 0, bankAccounts: 0, pettyCash: 0, total: 0 };
    }
  }

  // Calculate accounts receivable
  async calculateAccountsReceivable(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccountsReceivable');
    }
    try {
      // Get account codes dynamically
      const accountCodes = await this.getAccountCodes(tenantId);
      
      // Calculate accounts receivable balance (dynamic lookup)
      const arAccountCode = accountCodes.accountsReceivable || '1201';
      const arBalance = await this.calculateAccountBalance(arAccountCode, statementDate, tenantId);

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
      logger.error('Error calculating accounts receivable:', error);
      return {
        tradeReceivables: 0,
        otherReceivables: 0,
        allowanceForDoubtfulAccounts: 0,
        netReceivables: 0
      };
    }
  }

  // Calculate inventory
  async calculateInventory(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateInventory');
    }
    try {
      // Get account codes dynamically
      const accountCodes = await this.getAccountCodes(tenantId);
      
      // Calculate inventory balance (dynamic lookup)
      const inventoryAccountCode = accountCodes.inventory || '1301';
      const inventoryBalance = await this.calculateAccountBalance(inventoryAccountCode, statementDate, tenantId);

      // Try to find separate inventory accounts for breakdown
      const rawMaterialsAccount = await ChartOfAccountsRepository.findOne({
        tenantId,
        accountName: { $regex: /raw.*material/i },
        accountType: 'asset',
        accountCategory: 'inventory',
        isActive: true
      });

      const workInProgressAccount = await ChartOfAccountsRepository.findOne({
        tenantId,
        accountName: { $regex: /work.*progress|wip/i },
        accountType: 'asset',
        accountCategory: 'inventory',
        isActive: true
      });

      let rawMaterials = 0;
      let workInProgress = 0;

      if (rawMaterialsAccount) {
        rawMaterials = await this.calculateAccountBalance(rawMaterialsAccount.accountCode, statementDate, tenantId);
      }

      if (workInProgressAccount) {
        workInProgress = await this.calculateAccountBalance(workInProgressAccount.accountCode, statementDate, tenantId);
      }

      const finishedGoods = Math.max(0, inventoryBalance) - rawMaterials - workInProgress;

      return {
        rawMaterials: Math.max(0, rawMaterials),
        workInProgress: Math.max(0, workInProgress),
        finishedGoods: Math.max(0, finishedGoods),
        total: Math.max(0, inventoryBalance)
      };
    } catch (error) {
      logger.error('Error calculating inventory:', error);
      return {
        rawMaterials: 0,
        workInProgress: 0,
        finishedGoods: 0,
        total: 0
      };
    }
  }

  // Calculate prepaid expenses
  async calculatePrepaidExpenses(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculatePrepaidExpenses');
    }
    try {
      // Find prepaid expense accounts
      const prepaidExpenseAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountCategory: 'prepaid_expenses',
        isActive: true,
        allowDirectPosting: true
      });

      let totalPrepaid = 0;
      for (const account of prepaidExpenseAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalPrepaid += balance;
      }

      // Also check for accounts with "prepaid" in the name
      const prepaidByName = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountName: { $regex: /prepaid/i },
        isActive: true,
        accountCategory: { $ne: 'prepaid_expenses' } // Avoid double counting
      });

      for (const account of prepaidByName) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalPrepaid += balance;
      }

      return Math.max(0, totalPrepaid);
    } catch (error) {
      logger.error('Error calculating prepaid expenses:', error);
      return 0;
    }
  }

  // Calculate property, plant, and equipment
  async calculatePropertyPlantEquipment(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculatePropertyPlantEquipment');
    }
    try {
      // Find fixed asset accounts
      const fixedAssetAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountCategory: 'fixed_assets',
        isActive: true,
        allowDirectPosting: true
      });

      let land = 0;
      let buildings = 0;
      let equipment = 0;
      let vehicles = 0;
      let furnitureAndFixtures = 0;
      let computerEquipment = 0;

      for (const account of fixedAssetAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        const accountName = (account.accountName || '').toLowerCase();

        if (accountName.includes('land')) {
          land += balance;
        } else if (accountName.includes('building') || accountName.includes('property')) {
          buildings += balance;
        } else if (accountName.includes('vehicle') || accountName.includes('car') || accountName.includes('truck')) {
          vehicles += balance;
        } else if (accountName.includes('furniture') || accountName.includes('fixture')) {
          furnitureAndFixtures += balance;
        } else if (accountName.includes('computer') || accountName.includes('software') || accountName.includes('it')) {
          computerEquipment += balance;
        } else if (accountName.includes('equipment') || accountName.includes('machinery')) {
          equipment += balance;
        } else {
          // Default to equipment
          equipment += balance;
        }
      }

      const total = land + buildings + equipment + vehicles + furnitureAndFixtures + computerEquipment;

      return {
        land: Math.max(0, land),
        buildings: Math.max(0, buildings),
        equipment: Math.max(0, equipment),
        vehicles: Math.max(0, vehicles),
        furnitureAndFixtures: Math.max(0, furnitureAndFixtures),
        computerEquipment: Math.max(0, computerEquipment),
        total: Math.max(0, total)
      };
    } catch (error) {
      logger.error('Error calculating property, plant, and equipment:', error);
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
  }

  // Calculate accumulated depreciation
  async calculateAccumulatedDepreciation(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccumulatedDepreciation');
    }
    try {
      // Find accumulated depreciation accounts (contra-asset accounts)
      const depreciationAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountName: { $regex: /accumulated.*depreciation|depreciation.*accumulated/i },
        isActive: true
      });

      let totalDepreciation = 0;
      for (const account of depreciationAccounts) {
        // Accumulated depreciation is a contra-asset (credit balance)
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalDepreciation += Math.abs(balance); // Use absolute value
      }

      // Also check for depreciation expense accounts that might track accumulated amounts
      const depreciationExpenseAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'expense',
        accountName: { $regex: /depreciation/i },
        isActive: true
      });

      // Sum depreciation expenses from transactions (this period's depreciation)
      // Note: This is current period depreciation, not accumulated
      // For accumulated, we'd need to sum all historical depreciation
      // For now, we'll use the contra-asset accounts which should track accumulated depreciation

      return Math.max(0, totalDepreciation);
    } catch (error) {
      logger.error('Error calculating accumulated depreciation:', error);
      return 0;
    }
  }

  // Calculate intangible assets
  async calculateIntangibleAssets(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateIntangibleAssets');
    }
    try {
      // Find intangible asset accounts
      const intangibleAssetAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountCategory: 'other_assets',
        isActive: true,
        $or: [
          { accountName: { $regex: /goodwill|patent|trademark|intangible/i } },
          { accountName: { $regex: /software.*asset|licens/i } }
        ]
      });

      let goodwill = 0;
      let patents = 0;
      let trademarks = 0;
      let software = 0;

      for (const account of intangibleAssetAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        const accountName = (account.accountName || '').toLowerCase();

        if (accountName.includes('goodwill')) {
          goodwill += balance;
        } else if (accountName.includes('patent')) {
          patents += balance;
        } else if (accountName.includes('trademark') || accountName.includes('brand')) {
          trademarks += balance;
        } else if (accountName.includes('software') || accountName.includes('license')) {
          software += balance;
        } else {
          // Default to software
          software += balance;
        }
      }

      const total = goodwill + patents + trademarks + software;

      return {
        goodwill: Math.max(0, goodwill),
        patents: Math.max(0, patents),
        trademarks: Math.max(0, trademarks),
        software: Math.max(0, software),
        total: Math.max(0, total)
      };
    } catch (error) {
      logger.error('Error calculating intangible assets:', error);
      return {
        goodwill: 0,
        patents: 0,
        trademarks: 0,
        software: 0,
        total: 0
      };
    }
  }

  // Calculate long-term investments
  async calculateLongTermInvestments(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateLongTermInvestments');
    }
    try {
      // Find long-term investment accounts
      const investmentAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountName: { $regex: /investment|securities|stock.*investment|bond.*investment/i },
        isActive: true,
        allowDirectPosting: true
      });

      let totalInvestments = 0;
      for (const account of investmentAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalInvestments += balance;
      }

      return Math.max(0, totalInvestments);
    } catch (error) {
      logger.error('Error calculating long-term investments:', error);
      return 0;
    }
  }

  // Calculate other assets
  async calculateOtherAssets(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateOtherAssets');
    }
    try {
      // Find other asset accounts that don't fit into main categories
      const otherAssetAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'asset',
        accountCategory: 'other_assets',
        isActive: true,
        allowDirectPosting: true,
        accountName: { 
          $not: { $regex: /goodwill|patent|trademark|intangible|investment|securities/i }
        }
      });

      let totalOtherAssets = 0;
      for (const account of otherAssetAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalOtherAssets += balance;
      }

      return Math.max(0, totalOtherAssets);
    } catch (error) {
      logger.error('Error calculating other assets:', error);
      return 0;
    }
  }

  // Calculate liabilities
  async calculateLiabilities(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateLiabilities');
    }
    try {
      const accountsPayable = await this.calculateAccountsPayable(statementDate, tenantId);
      const accruedExpenses = await this.calculateAccruedExpenses(statementDate, tenantId);
      const shortTermDebt = await this.calculateShortTermDebt(statementDate, tenantId);
      const deferredRevenue = await this.calculateDeferredRevenue(statementDate, tenantId);
      const longTermDebt = await this.calculateLongTermDebt(statementDate, tenantId);
      const deferredTaxLiabilities = await this.calculateDeferredTaxLiabilities(statementDate, tenantId);
      const pensionLiabilities = await this.calculatePensionLiabilities(statementDate, tenantId);
      const otherLongTermLiabilities = await this.calculateOtherLongTermLiabilities(statementDate, tenantId);

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
      logger.error('Error calculating liabilities:', error);
      throw error;
    }
  }

  // Calculate accounts payable
  async calculateAccountsPayable(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccountsPayable');
    }
    try {
      // Get account codes dynamically
      const accountCodes = await this.getAccountCodes(tenantId);
      
      // Calculate accounts payable balance (dynamic lookup)
      const apAccountCode = accountCodes.accountsPayable || '2001';
      const apBalance = await this.calculateAccountBalance(apAccountCode, statementDate, tenantId);

      return {
        tradePayables: Math.max(0, apBalance),
        otherPayables: 0,
        total: Math.max(0, apBalance)
      };
    } catch (error) {
      logger.error('Error calculating accounts payable:', error);
      return {
        tradePayables: 0,
        otherPayables: 0,
        total: 0
      };
    }
  }

  // Calculate accrued expenses
  async calculateAccruedExpenses(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccruedExpenses');
    }
    try {
      // Find accrued expense accounts
      const accruedExpenseAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountCategory: 'accrued_expenses',
        isActive: true,
        allowDirectPosting: true
      });

      let salariesPayable = 0;
      let utilitiesPayable = 0;
      let rentPayable = 0;
      let taxesPayable = 0;
      let interestPayable = 0;
      let otherAccruedExpenses = 0;

      for (const account of accruedExpenseAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        const accountName = (account.accountName || '').toLowerCase();

        if (accountName.includes('salary') || accountName.includes('wage')) {
          salariesPayable += balance;
        } else if (accountName.includes('utilit')) {
          utilitiesPayable += balance;
        } else if (accountName.includes('rent')) {
          rentPayable += balance;
        } else if (accountName.includes('tax')) {
          taxesPayable += balance;
        } else if (accountName.includes('interest')) {
          interestPayable += balance;
        } else {
          otherAccruedExpenses += balance;
        }
      }

      // Also check for sales tax payable
      const salesTaxPayableAccount = await ChartOfAccountsRepository.findOne({
        tenantId,
        accountCode: '2120',
        accountName: { $regex: /sales.*tax.*payable/i },
        isActive: true
      });

      if (salesTaxPayableAccount) {
        const salesTaxBalance = await this.calculateAccountBalance(salesTaxPayableAccount.accountCode, statementDate, tenantId);
        taxesPayable += Math.max(0, salesTaxBalance);
      }

      const total = salariesPayable + utilitiesPayable + rentPayable + 
                   taxesPayable + interestPayable + otherAccruedExpenses;

      return {
        salariesPayable: Math.max(0, salariesPayable),
        utilitiesPayable: Math.max(0, utilitiesPayable),
        rentPayable: Math.max(0, rentPayable),
        taxesPayable: Math.max(0, taxesPayable),
        interestPayable: Math.max(0, interestPayable),
        otherAccruedExpenses: Math.max(0, otherAccruedExpenses),
        total: Math.max(0, total)
      };
    } catch (error) {
      logger.error('Error calculating accrued expenses:', error);
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
  }

  // Calculate short-term debt
  async calculateShortTermDebt(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateShortTermDebt');
    }
    try {
      // Find short-term debt accounts
      const shortTermDebtAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountCategory: 'current_liabilities',
        isActive: true,
        allowDirectPosting: true,
        $or: [
          { accountName: { $regex: /credit.*line|line.*credit/i } },
          { accountName: { $regex: /short.*term.*loan|short.*term.*debt/i } },
          { accountName: { $regex: /credit.*card/i } },
          { accountCode: { $regex: /^21[3-9]/ } } // Common range for short-term debt
        ]
      });

      let creditLines = 0;
      let shortTermLoans = 0;
      let creditCardDebt = 0;

      for (const account of shortTermDebtAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        const accountName = (account.accountName || '').toLowerCase();

        if (accountName.includes('credit') && accountName.includes('line')) {
          creditLines += balance;
        } else if (accountName.includes('credit') && accountName.includes('card')) {
          creditCardDebt += balance;
        } else if (accountName.includes('short') && (accountName.includes('term') || accountName.includes('loan'))) {
          shortTermLoans += balance;
        } else {
          // Default to short-term loans
          shortTermLoans += balance;
        }
      }

      const total = creditLines + shortTermLoans + creditCardDebt;

      return {
        creditLines: Math.max(0, creditLines),
        shortTermLoans: Math.max(0, shortTermLoans),
        creditCardDebt: Math.max(0, creditCardDebt),
        total: Math.max(0, total)
      };
    } catch (error) {
      logger.error('Error calculating short-term debt:', error);
      return {
        creditLines: 0,
        shortTermLoans: 0,
        creditCardDebt: 0,
        total: 0
      };
    }
  }

  // Calculate deferred revenue
  async calculateDeferredRevenue(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateDeferredRevenue');
    }
    try {
      // Get orders that have been paid but not yet delivered
      const deferredOrders = await Sales.find({
        tenantId,
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
      logger.error('Error calculating deferred revenue:', error);
      return 0;
    }
  }

  // Calculate long-term debt
  async calculateLongTermDebt(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateLongTermDebt');
    }
    try {
      // Find long-term debt accounts
      const longTermDebtAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountCategory: 'long_term_liabilities',
        isActive: true,
        allowDirectPosting: true
      });

      let mortgages = 0;
      let longTermLoans = 0;
      let bondsPayable = 0;

      for (const account of longTermDebtAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        const accountName = (account.accountName || '').toLowerCase();

        if (accountName.includes('mortgage')) {
          mortgages += balance;
        } else if (accountName.includes('bond')) {
          bondsPayable += balance;
        } else if (accountName.includes('loan') || accountName.includes('debt')) {
          longTermLoans += balance;
        } else {
          // Default to long-term loans
          longTermLoans += balance;
        }
      }

      const total = mortgages + longTermLoans + bondsPayable;

      return {
        mortgages: Math.max(0, mortgages),
        longTermLoans: Math.max(0, longTermLoans),
        bondsPayable: Math.max(0, bondsPayable),
        total: Math.max(0, total)
      };
    } catch (error) {
      logger.error('Error calculating long-term debt:', error);
      return {
        mortgages: 0,
        longTermLoans: 0,
        bondsPayable: 0,
        total: 0
      };
    }
  }

  // Calculate deferred tax liabilities
  async calculateDeferredTaxLiabilities(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateDeferredTaxLiabilities');
    }
    try {
      // Find deferred tax liability accounts
      const deferredTaxAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountCategory: 'long_term_liabilities',
        isActive: true,
        $or: [
          { accountName: { $regex: /deferred.*tax/i } },
          { accountName: { $regex: /tax.*deferred/i } }
        ]
      });

      let totalDeferredTax = 0;
      for (const account of deferredTaxAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalDeferredTax += balance;
      }

      return Math.max(0, totalDeferredTax);
    } catch (error) {
      logger.error('Error calculating deferred tax liabilities:', error);
      return 0;
    }
  }

  // Calculate pension liabilities
  async calculatePensionLiabilities(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculatePensionLiabilities');
    }
    try {
      // Find pension liability accounts
      const pensionAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountName: { $regex: /pension|retirement|benefit.*plan/i },
        isActive: true,
        allowDirectPosting: true
      });

      let totalPension = 0;
      for (const account of pensionAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalPension += balance;
      }

      return Math.max(0, totalPension);
    } catch (error) {
      logger.error('Error calculating pension liabilities:', error);
      return 0;
    }
  }

  // Calculate other long-term liabilities
  async calculateOtherLongTermLiabilities(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateOtherLongTermLiabilities');
    }
    try {
      // Find other long-term liability accounts
      const otherLiabilityAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'liability',
        accountCategory: 'long_term_liabilities',
        isActive: true,
        allowDirectPosting: true,
        accountName: { 
          $not: { $regex: /mortgage|loan|bond|deferred.*tax|pension|retirement/i }
        }
      });

      let totalOtherLiabilities = 0;
      for (const account of otherLiabilityAccounts) {
        const balance = await this.calculateAccountBalance(account.accountCode, statementDate, tenantId);
        totalOtherLiabilities += balance;
      }

      return Math.max(0, totalOtherLiabilities);
    } catch (error) {
      logger.error('Error calculating other long-term liabilities:', error);
      return 0;
    }
  }

  // Calculate equity
  async calculateEquity(statementDate, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateEquity');
    }
    try {
      // Ensure statementDate is a Date object
      const date = statementDate instanceof Date ? statementDate : new Date(statementDate);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid statement date: ${statementDate}`);
      }

      const contributedCapital = await this.calculateContributedCapital(date, tenantId);
      const retainedEarnings = await this.calculateRetainedEarnings(date, periodType, tenantId);
      const otherEquity = await this.calculateOtherEquity(date, tenantId);

      // Ensure all values are numbers (handle NaN/undefined)
      const contributedCapitalTotal = Number(contributedCapital?.total) || 0;
      const retainedEarningsTotal = Number(retainedEarnings?.endingRetainedEarnings) || 0;
      const otherEquityTotal = Number(otherEquity?.total) || 0;

      // Calculate total equity manually
      const totalEquity = contributedCapitalTotal + retainedEarningsTotal + otherEquityTotal;

      const equity = {
        contributedCapital: {
          commonStock: Number(contributedCapital?.commonStock) || 0,
          preferredStock: Number(contributedCapital?.preferredStock) || 0,
          additionalPaidInCapital: Number(contributedCapital?.additionalPaidInCapital) || 0,
          total: contributedCapitalTotal
        },
        retainedEarnings: {
          beginningRetainedEarnings: Number(retainedEarnings?.beginningRetainedEarnings) || 0,
          currentPeriodEarnings: Number(retainedEarnings?.currentPeriodEarnings) || 0,
          dividendsPaid: Number(retainedEarnings?.dividendsPaid) || 0,
          endingRetainedEarnings: retainedEarningsTotal
        },
        otherEquity: {
          treasuryStock: Number(otherEquity?.treasuryStock) || 0,
          accumulatedOtherComprehensiveIncome: Number(otherEquity?.accumulatedOtherComprehensiveIncome) || 0,
          total: otherEquityTotal
        },
        totalEquity: totalEquity
      };

      return equity;
    } catch (error) {
      logger.error('Error calculating equity:', error);
      // Return default equity structure instead of throwing to prevent balance sheet generation failure
      return {
        contributedCapital: {
          commonStock: 0,
          preferredStock: 0,
          additionalPaidInCapital: 0,
          total: 0
        },
        retainedEarnings: {
          beginningRetainedEarnings: 0,
          currentPeriodEarnings: 0,
          dividendsPaid: 0,
          endingRetainedEarnings: 0
        },
        otherEquity: {
          treasuryStock: 0,
          accumulatedOtherComprehensiveIncome: 0,
          total: 0
        },
        totalEquity: 0
      };
    }
  }

  // Calculate account balance from transactions
  async calculateAccountBalance(accountCode, statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccountBalance');
    }
    try {
      // Ensure accountCode is uppercase to match Transaction model format
      const normalizedAccountCode = accountCode ? accountCode.toString().trim().toUpperCase() : null;
      if (!normalizedAccountCode) {
        return 0;
      }
      
      // Ensure statementDate is a Date object
      const date = statementDate instanceof Date ? statementDate : new Date(statementDate);
      if (isNaN(date.getTime())) {
        logger.error(`Invalid statement date: ${statementDate}`);
        return 0;
      }
      
      const account = await ChartOfAccountsRepository.findOne({ 
        tenantId,
        accountCode: normalizedAccountCode, 
        isActive: true 
      });
      if (!account) {
        return 0;
      }

      // Get opening balance
      let balance = account.openingBalance || 0;

      // Calculate balance from transactions up to statement date (tenant-scoped)
      const transactions = await TransactionRepository.aggregate([
        {
          $match: {
            tenantId,
            accountCode: normalizedAccountCode,
            createdAt: { $lte: date },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalDebits: { $sum: { $ifNull: ['$debitAmount', 0] } },
            totalCredits: { $sum: { $ifNull: ['$creditAmount', 0] } }
          }
        }
      ]);

      if (transactions.length > 0) {
        const totals = transactions[0];
        // For equity accounts (credit normal balance), balance increases with credits
        if (account.normalBalance === 'credit') {
          balance = balance + totals.totalCredits - totals.totalDebits;
        } else {
          balance = balance + totals.totalDebits - totals.totalCredits;
        }
      }

      return balance;
    } catch (error) {
      logger.error(`Error calculating balance for account ${accountCode}:`, error);
      return 0;
    }
  }

  // Calculate contributed capital
  async calculateContributedCapital(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateContributedCapital');
    }
    try {
      // Ensure statementDate is a Date object
      const date = statementDate instanceof Date ? statementDate : new Date(statementDate);
      
      // Get all owner equity accounts from Chart of Accounts
      // Exclude system accounts (parent accounts) as they don't have direct balances
      const ownerEquityAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'equity',
        accountCategory: 'owner_equity',
        isActive: true,
        isSystemAccount: { $ne: true } // Exclude parent/system accounts
      }).lean(); // Use lean() for better performance

      let commonStock = 0;
      let preferredStock = 0;
      let additionalPaidInCapital = 0;

      // Calculate balances for each equity account
      for (const account of ownerEquityAccounts) {
        if (!account || !account.accountCode) {
          continue; // Skip invalid accounts
        }
        const balance = await this.calculateAccountBalance(account.accountCode, date, tenantId);
        
        // Map accounts to balance sheet categories based on account name/code
        // Common stock typically uses codes like 3101, 3102, etc.
        // Preferred stock uses codes like 3103, 3104, etc.
        // Additional paid-in capital uses codes like 3105, 3106, etc.
        const accountCodeNum = parseInt(account.accountCode) || 0;
        const accountNameLower = (account.accountName || '').toLowerCase();

        if (accountNameLower.includes('common stock') || 
            accountNameLower.includes('common') ||
            (accountCodeNum >= 3101 && accountCodeNum < 3103)) {
          commonStock += balance;
        } else if (accountNameLower.includes('preferred stock') || 
                   accountNameLower.includes('preferred') ||
                   (accountCodeNum >= 3103 && accountCodeNum < 3105)) {
          preferredStock += balance;
        } else if (accountNameLower.includes('paid-in') || 
                   accountNameLower.includes('additional') ||
                   accountNameLower.includes('capital') ||
                   (accountCodeNum >= 3105 && accountCodeNum < 3200)) {
          additionalPaidInCapital += balance;
        } else {
          // Default: treat as common stock if it's owner equity
          commonStock += balance;
        }
      }

      const total = commonStock + preferredStock + additionalPaidInCapital;

      return {
        commonStock,
        preferredStock,
        additionalPaidInCapital,
        total
      };
    } catch (error) {
      logger.error('Error calculating contributed capital:', error);
      // Return zeros instead of hardcoded default
      return {
        commonStock: 0,
        preferredStock: 0,
        additionalPaidInCapital: 0,
        total: 0
      };
    }
  }

  // Calculate retained earnings
  async calculateRetainedEarnings(statementDate, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateRetainedEarnings');
    }
    try {
      // Get previous period's retained earnings
      const previousPeriod = await this.getPreviousPeriod(statementDate, periodType);
      let beginningRetainedEarnings = 0;

      if (previousPeriod) {
        const previousBalanceSheet = await BalanceSheetRepository.findOne({
          tenantId,
          statementDate: previousPeriod,
          periodType
        });
        if (previousBalanceSheet) {
          beginningRetainedEarnings = previousBalanceSheet.equity.retainedEarnings.endingRetainedEarnings;
        }
      }

      // Calculate current period earnings (this would need to be integrated with P&L)
      const currentPeriodEarnings = await this.calculateCurrentPeriodEarnings(statementDate, periodType, tenantId);

      // Calculate dividends paid (this would need to be tracked)
      const dividendsPaid = await this.calculateDividendsPaid(statementDate, periodType, tenantId);

      return {
        beginningRetainedEarnings: beginningRetainedEarnings,
        currentPeriodEarnings: currentPeriodEarnings,
        dividendsPaid: dividendsPaid,
        endingRetainedEarnings: beginningRetainedEarnings + currentPeriodEarnings - dividendsPaid
      };
    } catch (error) {
      logger.error('Error calculating retained earnings:', error);
      return {
        beginningRetainedEarnings: 0,
        currentPeriodEarnings: 0,
        dividendsPaid: 0,
        endingRetainedEarnings: 0
      };
    }
  }

  // Calculate other equity
  async calculateOtherEquity(statementDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateOtherEquity');
    }
    try {
      // Ensure statementDate is a Date object
      const date = statementDate instanceof Date ? statementDate : new Date(statementDate);
      
      // Get equity accounts that are not owner_equity or retained_earnings
      // Exclude system accounts (parent accounts) as they don't have direct balances
      const otherEquityAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'equity',
        accountCategory: { $nin: ['owner_equity', 'retained_earnings'] },
        isActive: true,
        isSystemAccount: { $ne: true } // Exclude parent/system accounts
      }).lean(); // Use lean() for better performance

      let treasuryStock = 0;
      let accumulatedOtherComprehensiveIncome = 0;

      // Calculate balances for each equity account
      for (const account of otherEquityAccounts) {
        if (!account || !account.accountCode) {
          continue; // Skip invalid accounts
        }
        const balance = await this.calculateAccountBalance(account.accountCode, date, tenantId);
        
        // Map accounts to balance sheet categories based on account name
        const accountNameLower = (account.accountName || '').toLowerCase();

        if (accountNameLower.includes('treasury') || 
            accountNameLower.includes('treasury stock')) {
          treasuryStock += balance;
        } else if (accountNameLower.includes('comprehensive') || 
                   accountNameLower.includes('other comprehensive')) {
          accumulatedOtherComprehensiveIncome += balance;
        } else {
          // Default: treat as other comprehensive income
          accumulatedOtherComprehensiveIncome += balance;
        }
      }

      const total = treasuryStock + accumulatedOtherComprehensiveIncome;

      return {
        treasuryStock,
        accumulatedOtherComprehensiveIncome,
        total
      };
    } catch (error) {
      logger.error('Error calculating other equity:', error);
      return {
        treasuryStock: 0,
        accumulatedOtherComprehensiveIncome: 0,
        total: 0
      };
    }
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
  async calculateCurrentPeriodEarnings(statementDate, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateCurrentPeriodEarnings');
    }
    try {
      // Integrate with P&L service for accurate net income
      const startDate = this.getPreviousPeriod(statementDate, periodType);
      
      // Try to find existing P&L statement for this period (tenant-scoped)
      const FinancialStatement = require('../models/FinancialStatement');
      const plStatement = await FinancialStatement.findOne({
        tenantId,
        type: 'profit_loss',
        'period.startDate': startDate,
        'period.endDate': statementDate,
        status: { $in: ['draft', 'review', 'approved', 'published'] }
      }).sort({ createdAt: -1 });

      if (plStatement && plStatement.netIncome && plStatement.netIncome.amount !== undefined) {
        // Use actual net income from P&L statement
        return plStatement.netIncome.amount;
      }

      // Fallback: Calculate from journal entries (event-based) if P&L not available
      // This ensures we use the single source of truth (journal entries) instead of direct queries
      try {
        const financialReportingService = require('./financialReportingService');
        const plData = await financialReportingService.generateProfitAndLoss({
          tenantId: tenantId,
          startDate: startDate,
          endDate: statementDate
        });

        if (plData && plData.netIncome !== undefined) {
          return plData.netIncome;
        }
      } catch (plError) {
        logger.warn('Error calculating P&L from journal entries for balance sheet:', plError);
        // If journal entry calculation fails, return 0 instead of using direct queries
        // This prevents showing incorrect data from deleted/edited transactions
      }

      // Return 0 if P&L calculation fails (safer than using direct queries)
      // Direct queries can show incorrect data if transactions were deleted/edited
      // This maintains data integrity even if it means showing 0 instead of potentially wrong data
      return 0;
    } catch (error) {
      logger.error('Error calculating current period earnings:', error);
      return 0;
    }
  }

  // Calculate dividends paid
  async calculateDividendsPaid(statementDate, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateDividendsPaid');
    }
    try {
      // Find dividend accounts
      const dividendAccounts = await ChartOfAccountsRepository.findAll({
        tenantId,
        accountType: 'equity',
        accountName: { $regex: /dividend/i },
        isActive: true,
        allowDirectPosting: true
      });

      const startDate = this.getPreviousPeriod(statementDate, periodType);
      let totalDividends = 0;

      // Sum dividends from transactions in the period (tenant-scoped)
      for (const account of dividendAccounts) {
        const dividendTransactions = await TransactionRepository.findAll({
          tenantId,
          accountCode: account.accountCode,
          createdAt: { $gte: startDate, $lte: statementDate },
          status: 'completed',
          debitAmount: { $gt: 0 } // Dividends reduce equity (debit)
        });

        dividendTransactions.forEach(transaction => {
          totalDividends += transaction.debitAmount || 0;
        });
      }

      return Math.max(0, totalDividends);
    } catch (error) {
      logger.error('Error calculating dividends paid:', error);
      return 0;
    }
  }

  // Get balance sheet comparison data
  async getComparisonData(balanceSheetId, comparisonType = 'previous') {
    try {
      const currentBalanceSheet = await BalanceSheetRepository.findById(balanceSheetId);
      if (!currentBalanceSheet) {
        throw new Error('Balance sheet not found');
      }

      let comparisonBalanceSheet;
      
      switch (comparisonType) {
        case 'previous':
          comparisonBalanceSheet = await BalanceSheetRepository.findOne({
            statementDate: { $lt: currentBalanceSheet.statementDate },
            periodType: currentBalanceSheet.periodType
          }, {
            sort: { statementDate: -1 }
          });
          break;
        case 'year_ago':
          const yearAgo = new Date(currentBalanceSheet.statementDate);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          comparisonBalanceSheet = await BalanceSheetRepository.findOne({
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
      logger.error('Error getting comparison data:', error);
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
