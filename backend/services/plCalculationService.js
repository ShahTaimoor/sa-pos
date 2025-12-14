const FinancialStatement = require('../models/FinancialStatement');
const Sales = require('../models/Sales');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

class PLCalculationService {
  constructor() {
    this.expenseCategories = {
      selling: [
        'advertising', 'marketing', 'sales_commissions', 'sales_salaries',
        'travel_entertainment', 'promotional', 'customer_service'
      ],
      administrative: [
        'office_supplies', 'rent', 'utilities', 'insurance', 'legal',
        'accounting', 'management_salaries', 'training', 'software',
        'equipment', 'maintenance', 'professional_services'
      ]
    };
  }

  // Generate comprehensive P&L statement
  async generatePLStatement(period, options = {}) {
    const {
      companyInfo = {},
      includeDetails = true,
      calculateComparisons = true,
      userId = null
    } = options;

    const startTime = Date.now();
    
    try {
      // Calculate all financial data
      const financialData = await this.calculateFinancialData(period);
      
      // Create P&L statement
      const plStatement = new FinancialStatement({
        type: 'profit_loss',
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          type: period.type || 'monthly',
        },
        company: companyInfo,
        generatedBy: userId,
        status: 'draft',
        metadata: {
          calculationMethod: 'automated',
          currency: 'USD',
          dataSource: 'database',
          generationTime: 0,
        },
      });

      // Populate all financial data
      await this.populateRevenueData(plStatement, financialData, includeDetails);
      await this.populateCOGSData(plStatement, financialData, includeDetails);
      await this.populateExpenseData(plStatement, financialData, includeDetails);
      await this.populateOtherData(plStatement, financialData, includeDetails);
      
      // Calculate all derived values
      plStatement.calculateDerivedValues();
      
      // Add comparisons if requested
      if (calculateComparisons) {
        await this.addComparisons(plStatement);
      }
      
      // Calculate generation time
      plStatement.metadata.generationTime = Date.now() - startTime;
      
      // Save the statement
      await plStatement.save();
      
      return plStatement;
    } catch (error) {
      console.error('Error generating P&L statement:', error);
      throw error;
    }
  }

  // Calculate all financial data from database
  async calculateFinancialData(period) {
    const data = {
      revenue: await this.calculateRevenue(period),
      cogs: await this.calculateCOGS(period),
      expenses: await this.calculateExpenses(period),
      otherIncome: await this.calculateOtherIncome(period),
      otherExpenses: await this.calculateOtherExpenses(period),
      taxes: await this.calculateTaxes(period),
    };

    return data;
  }

  // Calculate revenue data
  async calculateRevenue(period) {
    // Get revenue transactions (Sales Revenue account: 4001)
    const revenueTransactions = await Transaction.find({
      accountCode: '4001',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed'
    });

    let grossSales = 0;
    let salesReturns = 0;
    let salesDiscounts = 0;
    const salesByCategory = {};
    const returnsByCategory = {};
    const discountsByType = {};

    // Calculate total sales revenue
    revenueTransactions.forEach(transaction => {
      if (transaction.creditAmount > 0) {
        grossSales += transaction.creditAmount;
        
        // Categorize by description
        const category = this.categorizeRevenue(transaction.description);
        salesByCategory[category] = (salesByCategory[category] || 0) + transaction.creditAmount;
      }
    });

    // Get sales returns (negative revenue transactions)
    const returnTransactions = await Transaction.find({
      accountCode: '4001',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      debitAmount: { $gt: 0 }
    });

    returnTransactions.forEach(transaction => {
      salesReturns += transaction.debitAmount;
    });

    return {
      grossSales,
      salesReturns,
      salesDiscounts,
      salesByCategory,
      returnsByCategory,
      discountsByType,
    };
  }

  // Helper method to categorize revenue
  categorizeRevenue(description) {
    if (description.toLowerCase().includes('sale')) return 'Sales';
    if (description.toLowerCase().includes('service')) return 'Services';
    if (description.toLowerCase().includes('rental')) return 'Rental Income';
    if (description.toLowerCase().includes('interest')) return 'Interest Income';
    return 'Other Revenue';
  }

  // Calculate Cost of Goods Sold
  async calculateCOGS(period) {
    // Get COGS transactions (Cost of Goods Sold account: 5001)
    const cogsTransactions = await Transaction.find({
      accountCode: '5001',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed'
    });

    let totalCOGS = 0;
    const cogsDetails = [];

    cogsTransactions.forEach(transaction => {
      if (transaction.debitAmount > 0) {
        totalCOGS += transaction.debitAmount;
        cogsDetails.push({
          description: transaction.description,
          amount: transaction.debitAmount,
          reference: transaction.reference,
          date: transaction.createdAt
        });
      }
    });

    // Get beginning inventory (from previous period)
    const beginningInventory = await this.getInventoryValue(period.startDate);
    
    // Get ending inventory (from current period end)
    const endingInventory = await this.getInventoryValue(period.endDate);
    
    // Get purchases during the period
    const purchases = await this.calculatePurchases(period);
    
    // Get purchase returns and discounts
    const purchaseAdjustments = await this.calculatePurchaseAdjustments(period);
    
    return {
      beginningInventory,
      endingInventory,
      purchases: purchases.total,
      purchaseDetails: purchases.details,
      freightIn: purchases.freightIn || 0,
      purchaseReturns: purchaseAdjustments.returns,
      purchaseDiscounts: purchaseAdjustments.discounts,
      totalCOGS,
      cogsDetails
    };
  }

  // Calculate inventory value at a specific date
  async getInventoryValue(date) {
    const products = await Product.find({ status: 'active' });
    let totalValue = 0;

    for (const product of products) {
      const stockValue = (product.inventory?.currentStock || 0) * (product.pricing?.cost || 0);
      totalValue += stockValue;
    }

    return totalValue;
  }

  // Calculate purchases during period
  async calculatePurchases(period) {
    const purchaseOrders = await PurchaseOrder.find({
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['received', 'completed'] }
    }).populate('items.product supplier');

    let totalPurchases = 0;
    let freightIn = 0;
    const purchaseDetails = [];

    purchaseOrders.forEach(po => {
      const orderTotal = po.total || 0;
      totalPurchases += orderTotal;
      
      if (po.shippingCost) {
        freightIn += po.shippingCost;
      }

      purchaseDetails.push({
        supplier: po.supplier?.companyName || 'Unknown',
        amount: orderTotal,
        date: po.createdAt,
      });
    });

    return {
      total: totalPurchases,
      details: purchaseDetails,
      freightIn,
    };
  }

  // Calculate purchase adjustments
  async calculatePurchaseAdjustments(period) {
    // This would typically come from purchase order adjustments
    // For now, we'll return zeros as this data might not be tracked
    return {
      returns: 0,
      discounts: 0,
    };
  }

  // Calculate operating expenses
  async calculateExpenses(period) {
    // In a real system, these would come from expense tracking
    // For now, we'll use placeholder data based on typical business ratios
    
    const revenue = await this.calculateRevenue(period);
    const netSales = revenue.grossSales - revenue.salesReturns - revenue.salesDiscounts;
    
    // Estimate expenses based on typical retail ratios
    const sellingExpenses = {
      advertising: netSales * 0.02, // 2% of sales
      marketing: netSales * 0.015, // 1.5% of sales
      sales_salaries: netSales * 0.03, // 3% of sales
      travel_entertainment: netSales * 0.005, // 0.5% of sales
      promotional: netSales * 0.01, // 1% of sales
      customer_service: netSales * 0.01, // 1% of sales
    };

    const administrativeExpenses = {
      office_supplies: netSales * 0.005, // 0.5% of sales
      rent: netSales * 0.04, // 4% of sales
      utilities: netSales * 0.01, // 1% of sales
      insurance: netSales * 0.005, // 0.5% of sales
      legal: netSales * 0.002, // 0.2% of sales
      accounting: netSales * 0.003, // 0.3% of sales
      management_salaries: netSales * 0.05, // 5% of sales
      training: netSales * 0.002, // 0.2% of sales
      software: netSales * 0.01, // 1% of sales
      equipment: netSales * 0.005, // 0.5% of sales
      maintenance: netSales * 0.008, // 0.8% of sales
      professional_services: netSales * 0.003, // 0.3% of sales
    };

    return {
      selling: sellingExpenses,
      administrative: administrativeExpenses,
    };
  }

  // Calculate other income
  async calculateOtherIncome(period) {
    // This would typically come from other income tracking
    // For now, return minimal values
    return {
      interestIncome: 0,
      rentalIncome: 0,
      other: 0,
    };
  }

  // Calculate other expenses
  async calculateOtherExpenses(period) {
    // This would typically come from expense tracking
    // For now, return minimal values
    return {
      interestExpense: 0,
      depreciation: 0,
      amortization: 0,
      other: 0,
    };
  }

  // Calculate taxes
  async calculateTaxes(period) {
    // This would typically come from tax calculation
    // For now, return minimal values
    return {
      current: 0,
      deferred: 0,
    };
  }

  // Populate revenue data in P&L statement
  async populateRevenueData(statement, data, includeDetails) {
    statement.revenue.grossSales.amount = data.revenue.grossSales;
    statement.revenue.salesReturns.amount = data.revenue.salesReturns;
    statement.revenue.salesDiscounts.amount = data.revenue.salesDiscounts;
    statement.revenue.otherRevenue.amount = data.otherIncome.interestIncome + 
      data.otherIncome.rentalIncome + data.otherIncome.other;

    if (includeDetails) {
      // Add sales by category details
      Object.entries(data.revenue.salesByCategory).forEach(([category, amount]) => {
        statement.revenue.grossSales.details.push({
          category,
          amount,
          description: `Sales in ${category} category`,
        });
      });

      // Add discount details
      Object.entries(data.revenue.discountsByType).forEach(([type, amount]) => {
        statement.revenue.salesDiscounts.details.push({
          type,
          amount,
          description: `${type} discounts`,
        });
      });
    }
  }

  // Populate COGS data in P&L statement
  async populateCOGSData(statement, data, includeDetails) {
    statement.costOfGoodsSold.beginningInventory = data.cogs.beginningInventory;
    statement.costOfGoodsSold.endingInventory = data.cogs.endingInventory;
    statement.costOfGoodsSold.purchases.amount = data.cogs.purchases;
    statement.costOfGoodsSold.freightIn = data.cogs.freightIn;
    statement.costOfGoodsSold.purchaseReturns = data.cogs.purchaseReturns;
    statement.costOfGoodsSold.purchaseDiscounts = data.cogs.purchaseDiscounts;

    // Set the calculated COGS from transactions
    statement.costOfGoodsSold.totalCOGS.amount = data.cogs.totalCOGS;

    if (includeDetails) {
      statement.costOfGoodsSold.purchases.details = data.cogs.purchaseDetails;
      // Add COGS transaction details
      statement.costOfGoodsSold.cogsDetails = data.cogs.cogsDetails;
    }
  }

  // Populate expense data in P&L statement
  async populateExpenseData(statement, data, includeDetails) {
    // Selling expenses
    let sellingTotal = 0;
    Object.entries(data.expenses.selling).forEach(([category, amount]) => {
      sellingTotal += amount;
      statement.operatingExpenses.sellingExpenses.details.push({
        category,
        amount,
        description: `${category.replace('_', ' ')} expenses`,
      });
    });
    statement.operatingExpenses.sellingExpenses.total = sellingTotal;

    // Administrative expenses
    let adminTotal = 0;
    Object.entries(data.expenses.administrative).forEach(([category, amount]) => {
      adminTotal += amount;
      statement.operatingExpenses.administrativeExpenses.details.push({
        category,
        amount,
        description: `${category.replace('_', ' ')} expenses`,
      });
    });
    statement.operatingExpenses.administrativeExpenses.total = adminTotal;
  }

  // Populate other data in P&L statement
  async populateOtherData(statement, data, includeDetails) {
    statement.otherIncome.interestIncome = data.otherIncome.interestIncome;
    statement.otherIncome.rentalIncome = data.otherIncome.rentalIncome;
    statement.otherIncome.other.amount = data.otherIncome.other;

    statement.otherExpenses.interestExpense = data.otherExpenses.interestExpense;
    statement.otherExpenses.depreciation = data.otherExpenses.depreciation;
    statement.otherExpenses.amortization = data.otherExpenses.amortization;
    statement.otherExpenses.other.amount = data.otherExpenses.other;

    statement.incomeTax.current = data.taxes.current;
    statement.incomeTax.deferred = data.taxes.deferred;
  }

  // Add comparisons to P&L statement
  async addComparisons(statement) {
    try {
      // Get previous period statement
      const previousStatement = await FinancialStatement.findOne({
        type: 'profit_loss',
        'period.endDate': { $lt: statement.period.startDate },
      }).sort({ 'period.endDate': -1 });

      if (previousStatement) {
        const netIncomeChange = statement.netIncome.amount - previousStatement.netIncome.amount;
        const netIncomeChangePercent = previousStatement.netIncome.amount !== 0 ? 
          (netIncomeChange / previousStatement.netIncome.amount) * 100 : 0;

        statement.comparison.previousPeriod = {
          period: `${previousStatement.period.startDate.toISOString().split('T')[0]} to ${previousStatement.period.endDate.toISOString().split('T')[0]}`,
          netIncome: previousStatement.netIncome.amount,
          change: netIncomeChange,
          changePercent: netIncomeChangePercent,
        };
      }

      // Get budget statement (if exists)
      const budgetStatement = await FinancialStatement.findOne({
        type: 'budget_profit_loss',
        'period.startDate': statement.period.startDate,
        'period.endDate': statement.period.endDate,
      });

      if (budgetStatement) {
        const variance = statement.netIncome.amount - budgetStatement.netIncome.amount;
        const variancePercent = budgetStatement.netIncome.amount !== 0 ? 
          (variance / budgetStatement.netIncome.amount) * 100 : 0;

        statement.comparison.budget = {
          period: 'Budget',
          netIncome: budgetStatement.netIncome.amount,
          variance,
          variancePercent,
        };
      }
    } catch (error) {
      console.error('Error adding comparisons:', error);
      // Don't throw error, just skip comparisons
    }
  }

  // Get P&L summary for dashboard
  async getPLSummary(period) {
    const statement = await FinancialStatement.findOne({
      type: 'profit_loss',
      'period.startDate': period.startDate,
      'period.endDate': period.endDate,
    });

    if (!statement) {
      // Generate statement if it doesn't exist
      return await this.generatePLStatement(period, { includeDetails: false });
    }

    return {
      totalRevenue: statement.revenue.totalRevenue.amount,
      grossProfit: statement.grossProfit.amount,
      operatingIncome: statement.operatingIncome.amount,
      netIncome: statement.netIncome.amount,
      grossMargin: statement.grossProfit.margin,
      operatingMargin: statement.operatingIncome.margin,
      netMargin: statement.netIncome.margin,
      period: statement.period,
      lastUpdated: statement.metadata.lastUpdated,
    };
  }

  // Get P&L trends over time
  async getPLTrends(periods) {
    const statements = await FinancialStatement.find({
      type: 'profit_loss',
      'period.startDate': { $in: periods.map(p => p.startDate) },
    }).sort({ 'period.startDate': 1 });

    return statements.map(statement => ({
      period: statement.period,
      totalRevenue: statement.revenue.totalRevenue.amount,
      grossProfit: statement.grossProfit.amount,
      operatingIncome: statement.operatingIncome.amount,
      netIncome: statement.netIncome.amount,
      grossMargin: statement.grossProfit.margin,
      operatingMargin: statement.operatingIncome.margin,
      netMargin: statement.netIncome.margin,
    }));
  }
}

module.exports = new PLCalculationService();
