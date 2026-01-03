const FinancialStatementRepository = require('../repositories/FinancialStatementRepository');
const SalesRepository = require('../repositories/SalesRepository');
const ProductRepository = require('../repositories/ProductRepository');
const PurchaseOrderRepository = require('../repositories/PurchaseOrderRepository');
const PurchaseInvoiceRepository = require('../repositories/PurchaseInvoiceRepository');
const ReturnRepository = require('../repositories/ReturnRepository');
const TransactionRepository = require('../repositories/TransactionRepository');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const AccountingService = require('./accountingService');
const expenseAccountMapping = require('../config/expenseAccountMapping');
const expenseCategorizationService = require('./expenseCategorizationService');
const budgetComparisonService = require('./budgetComparisonService');
const taxCalculationService = require('./taxCalculationService');
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
      
      // Create P&L statement (using model for instance methods)
      const FinancialStatement = require('../models/FinancialStatement');
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
    };
    
    // Calculate earnings before tax first (needed for income tax calculation)
    const grossProfit = data.revenue.grossSales - data.revenue.salesReturns - 
                       data.revenue.salesDiscounts - data.cogs.totalCOGS;
    const operatingIncome = grossProfit - 
      (Object.values(data.expenses.selling).reduce((sum, val) => sum + val, 0) +
       Object.values(data.expenses.administrative).reduce((sum, val) => sum + val, 0));
    const earningsBeforeTax = operatingIncome + 
      (data.otherIncome.interestIncome + data.otherIncome.rentalIncome + data.otherIncome.other) -
      (data.otherExpenses.interestExpense + data.otherExpenses.depreciation + 
       data.otherExpenses.amortization + data.otherExpenses.other);
    
    // Calculate taxes with earnings before tax
    data.taxes = await this.calculateTaxes(period, earningsBeforeTax);
    
    return data;
  }

  // Get account codes dynamically
  async getAccountCodes() {
    if (!this._accountCodes) {
      this._accountCodes = await AccountingService.getDefaultAccountCodes();
    }
    return this._accountCodes;
  }

  // Calculate revenue data
  async calculateRevenue(period) {
    // Get Sales Revenue account code dynamically
    const accountCodes = await this.getAccountCodes();
    const salesRevenueCode = accountCodes.salesRevenue;
    
    // Get revenue transactions
    const revenueTransactions = await TransactionRepository.findAll({
      accountCode: salesRevenueCode,
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed'
    });

    let grossSales = 0;
    let salesReturns = 0;
    let salesDiscounts = 0;
    const salesByCategory = {};
    const returnsByCategory = {};
    const discountsByType = {};
    const discountDetails = [];

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
    const returnTransactions = await TransactionRepository.findAll({
      accountCode: salesRevenueCode,
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      debitAmount: { $gt: 0 }
    });

    returnTransactions.forEach(transaction => {
      salesReturns += transaction.debitAmount;
    });

    // Get actual sales discounts from Sales orders
    const salesOrders = await SalesRepository.findAll({
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['completed', 'delivered', 'shipped', 'confirmed'] }
    }, {
      select: 'orderNumber pricing.discountAmount items.discountAmount items.discountPercent createdAt customer'
    });

    // Calculate discounts from orders
    salesOrders.forEach(order => {
      const orderDiscount = order.pricing?.discountAmount || 0;
      
      if (orderDiscount > 0) {
        salesDiscounts += orderDiscount;
        
        // Categorize discount by type based on item discounts
        let discountType = 'other';
        
        // Check if discount is from item-level (bulk, customer discount, etc.)
        const hasItemDiscounts = order.items?.some(item => (item.discountAmount || 0) > 0);
        if (hasItemDiscounts) {
          // Calculate average discount percentage
          const totalItemDiscount = order.items.reduce((sum, item) => 
            sum + (item.discountAmount || 0), 0);
          const totalItemSubtotal = order.items.reduce((sum, item) => 
            sum + (item.subtotal || (item.quantity * item.unitPrice)), 0);
          const avgDiscountPercent = totalItemSubtotal > 0 ? 
            (totalItemDiscount / totalItemSubtotal) * 100 : 0;
          
          // Categorize based on discount percentage and patterns
          if (avgDiscountPercent >= 15) {
            discountType = 'bulk'; // High discount usually means bulk
          } else if (avgDiscountPercent >= 5) {
            discountType = 'customer'; // Medium discount usually customer discount
          } else if (avgDiscountPercent > 0) {
            discountType = 'promotional'; // Small discount usually promotional
          }
          
          // Check if customer has discount (would indicate customer discount)
          if (order.customer && avgDiscountPercent > 0 && avgDiscountPercent < 15) {
            discountType = 'customer';
          }
        }
        
        discountDetails.push({
          orderNumber: order.orderNumber,
          date: order.createdAt,
          amount: orderDiscount,
          type: discountType,
        });
        
        // Sum by discount type
        discountsByType[discountType] = (discountsByType[discountType] || 0) + orderDiscount;
      }
    });

    // Also check for discount-type transactions (if any)
    const discountTransactions = await TransactionRepository.findAll({
      type: 'discount',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      debitAmount: { $gt: 0 }
    });

    discountTransactions.forEach(transaction => {
      const discountAmount = transaction.debitAmount || 0;
      if (discountAmount > 0) {
        salesDiscounts += discountAmount;
        
        const discountType = this.categorizeDiscountType(
          transaction.description || 'other',
          transaction.reference || ''
        );
        
        discountsByType[discountType] = (discountsByType[discountType] || 0) + discountAmount;
        
        discountDetails.push({
          orderNumber: transaction.reference || transaction.transactionId,
          date: transaction.createdAt,
          amount: discountAmount,
          type: discountType,
          transactionId: transaction.transactionId,
        });
      }
    });

    return {
      grossSales,
      salesReturns,
      salesDiscounts,
      salesByCategory,
      returnsByCategory,
      discountsByType,
      discountDetails,
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

  // Helper method to categorize discount type
  categorizeDiscountType(discountType, discountCode) {
    if (!discountType) return 'other';
    
    const type = discountType.toLowerCase();
    const code = (discountCode || '').toLowerCase();
    
    // Check discount type
    if (type.includes('bulk') || code.includes('bulk')) return 'bulk';
    if (type.includes('loyalty') || code.includes('loyalty') || code.includes('reward')) return 'loyalty';
    if (type.includes('promotional') || type.includes('promo') || code.includes('promo')) return 'promotional';
    if (type.includes('customer') || code.includes('customer') || code.includes('cust')) return 'customer';
    if (type.includes('seasonal') || code.includes('seasonal')) return 'seasonal';
    if (type.includes('clearance') || code.includes('clearance')) return 'clearance';
    if (type.includes('first') || code.includes('first') || code.includes('new')) return 'first_time';
    
    return 'other';
  }

  // Calculate Cost of Goods Sold
  async calculateCOGS(period) {
    // Get COGS account code dynamically
    const accountCodes = await this.getAccountCodes();
    const cogsCode = accountCodes.costOfGoodsSold;
    
    // Get COGS transactions
    const cogsTransactions = await TransactionRepository.findAll({
      accountCode: cogsCode,
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
      purchaseAdjustments: purchaseAdjustments, // Include full adjustment details
      totalCOGS,
      cogsDetails
    };
  }

  // Calculate inventory value at a specific date
  async getInventoryValue(date) {
    const products = await ProductRepository.findAll({ status: 'active' });
    let totalValue = 0;

    for (const product of products) {
      const stockValue = (product.inventory?.currentStock || 0) * (product.pricing?.cost || 0);
      totalValue += stockValue;
    }

    return totalValue;
  }

  // Calculate purchases during period
  async calculatePurchases(period) {
    const purchaseOrders = await PurchaseOrderRepository.findAll({
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['received', 'completed'] }
    }, {
      populate: [
        { path: 'items.product' },
        { path: 'supplier' }
      ]
    });

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

  // Calculate purchase adjustments (returns and discounts)
  async calculatePurchaseAdjustments(period) {
    let purchaseReturns = 0;
    let purchaseDiscounts = 0;
    const returnDetails = [];
    const discountDetails = [];

    // Get purchase returns from PurchaseInvoice (invoiceType = 'return')
    const purchaseReturnInvoices = await PurchaseInvoiceRepository.findAll({
      invoiceType: 'return',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['confirmed', 'received', 'paid', 'closed'] }
    }, {
      populate: [{ path: 'supplier', select: 'companyName' }],
      select: 'invoiceNumber pricing.total pricing.subtotal supplier createdAt'
    });

    purchaseReturnInvoices.forEach(invoice => {
      const returnAmount = invoice.pricing?.total || invoice.pricing?.subtotal || 0;
      if (returnAmount > 0) {
        purchaseReturns += returnAmount;
        returnDetails.push({
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.createdAt,
          amount: returnAmount,
          supplier: invoice.supplier?.companyName || 'Unknown',
        });
      }
    });

    // Get purchase returns from Return model (origin = 'purchase')
    const purchaseReturnsFromReturnModel = await ReturnRepository.findAll({
      origin: 'purchase',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['approved', 'processing', 'received', 'completed'] }
    }, {
      populate: [{ path: 'supplier', select: 'companyName' }],
      select: 'returnNumber totalRefundAmount netRefundAmount supplier createdAt'
    });

    purchaseReturnsFromReturnModel.forEach(returnDoc => {
      const returnAmount = returnDoc.netRefundAmount || returnDoc.totalRefundAmount || 0;
      if (returnAmount > 0) {
        purchaseReturns += returnAmount;
        returnDetails.push({
          returnNumber: returnDoc.returnNumber,
          date: returnDoc.createdAt,
          amount: returnAmount,
          supplier: returnDoc.supplier?.companyName || 'Unknown',
        });
      }
    });

    // Get purchase discounts from PurchaseInvoice (invoiceType = 'purchase' with discountAmount)
    const purchaseInvoices = await PurchaseInvoiceRepository.findAll({
      invoiceType: 'purchase',
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: { $in: ['confirmed', 'received', 'paid', 'closed'] },
      'pricing.discountAmount': { $gt: 0 }
    }, {
      populate: [{ path: 'supplier', select: 'companyName' }],
      select: 'invoiceNumber pricing.discountAmount pricing.subtotal supplier createdAt'
    });

    purchaseInvoices.forEach(invoice => {
      const discountAmount = invoice.pricing?.discountAmount || 0;
      if (discountAmount > 0) {
        purchaseDiscounts += discountAmount;
        
        // Calculate discount percentage to categorize
        const subtotal = invoice.pricing?.subtotal || 0;
        const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
        
        discountDetails.push({
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.createdAt,
          amount: discountAmount,
          discountPercent: discountPercent,
          supplier: invoice.supplier?.companyName || 'Unknown',
        });
      }
    });

    // Also check PurchaseOrder for any discount-related fields (if they exist in future)
    // Currently PurchaseOrder doesn't have discount fields, but we can check transactions
    // that might be related to purchase discounts

    return {
      returns: purchaseReturns,
      discounts: purchaseDiscounts,
      returnDetails: returnDetails,
      discountDetails: discountDetails,
    };
  }

  // Calculate operating expenses from actual transactions
  async calculateExpenses(period) {
    // Get expense account codes dynamically
    const accountCodes = await this.getAccountCodes();
    
    // Get all expense accounts (operating expenses category)
    const expenseAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'expense',
      accountCategory: 'operating_expenses',
      isActive: true,
      allowDirectPosting: true
    }).select('accountCode accountName accountCategory');
    
    // Get all expense transactions for the period
    const expenseAccountCodes = expenseAccounts.map(acc => acc.accountCode);
    
    // If no expense accounts found, try to get by category codes
    if (expenseAccountCodes.length === 0) {
      // Try to find common expense account codes
      const commonExpenseCodes = ['5210', '5220', accountCodes.otherExpenses].filter(Boolean);
      expenseAccountCodes.push(...commonExpenseCodes);
    }
    
    // Query all expense transactions
    const expenseTransactions = await TransactionRepository.findAll({
      accountCode: { $in: expenseAccountCodes },
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      debitAmount: { $gt: 0 } // Expenses are debits
    }, {
      populate: [{ path: 'orderId', select: 'orderNumber' }]
    });
    
    // Categorize expenses
    const sellingExpenses = {};
    const administrativeExpenses = {};
    
    // Store transaction details
    const sellingExpenseDetails = [];
    const administrativeExpenseDetails = [];
    
    // Map account codes to categories
    const accountCategoryMap = {};
    expenseAccounts.forEach(acc => {
      accountCategoryMap[acc.accountCode] = acc.accountName;
    });
    
    // Process each expense transaction
    expenseTransactions.forEach(transaction => {
      const accountCode = transaction.accountCode;
      const amount = transaction.debitAmount || 0;
      const accountName = accountCategoryMap[accountCode] || transaction.description || 'Unknown';
      
      // Create transaction detail object
      const transactionDetail = {
        transactionId: transaction.transactionId,
        date: transaction.createdAt,
        amount: amount,
        description: transaction.description || accountName,
        accountCode: accountCode,
        accountName: accountName,
        reference: transaction.reference || transaction.orderId?.orderNumber || '',
      };
      
      // Use enhanced categorization service
      const categorization = expenseCategorizationService.categorizeExpense({
        accountCode: accountCode,
        accountName: accountName,
        description: transaction.description || '',
        tags: transaction.metadata?.tags || [],
        metadata: transaction.metadata || {}
      });
      
      const expenseType = categorization.expenseType;
      const category = categorization.category;
      
      // Add confidence and factors to transaction detail for transparency
      transactionDetail.category = category;
      transactionDetail.categorizationConfidence = categorization.confidence;
      transactionDetail.categorizationReason = expenseCategorizationService.getReason(categorization.factors);
      
      if (expenseType === 'selling') {
        sellingExpenses[category] = (sellingExpenses[category] || 0) + amount;
        sellingExpenseDetails.push(transactionDetail);
      } else {
        // Default to administrative
        administrativeExpenses[category] = (administrativeExpenses[category] || 0) + amount;
        administrativeExpenseDetails.push(transactionDetail);
      }
    });
    
    // If no expenses found, return empty objects (not estimates)
    return {
      selling: sellingExpenses,
      administrative: administrativeExpenses,
      sellingDetails: sellingExpenseDetails,
      administrativeDetails: administrativeExpenseDetails,
    };
  }
  
  // Helper method to categorize selling expenses (uses configuration with fallback)
  categorizeSellingExpense(accountName, description) {
    // Try to get category from configuration first
    const nameBased = expenseAccountMapping.getExpenseTypeFromName(accountName);
    if (nameBased.expenseType === 'selling') {
      return nameBased.category;
    }
    
    // Fallback to description-based categorization
    const name = (accountName + ' ' + (description || '')).toLowerCase();
    if (name.includes('advertising') || name.includes('ad')) return 'advertising';
    if (name.includes('marketing')) return 'marketing';
    if (name.includes('commission')) return 'sales_commissions';
    if (name.includes('sales') && name.includes('salar')) return 'sales_salaries';
    if (name.includes('travel') || name.includes('entertainment')) return 'travel_entertainment';
    if (name.includes('promotional') || name.includes('promo')) return 'promotional';
    if (name.includes('customer') && name.includes('service')) return 'customer_service';
    return 'other_selling';
  }
  
  // Helper method to categorize administrative expenses (uses configuration with fallback)
  categorizeAdministrativeExpense(accountName, description) {
    // Try to get category from configuration first
    const nameBased = expenseAccountMapping.getExpenseTypeFromName(accountName);
    if (nameBased.expenseType === 'administrative') {
      return nameBased.category;
    }
    
    // Fallback to description-based categorization
    const name = (accountName + ' ' + (description || '')).toLowerCase();
    if (name.includes('office') && name.includes('suppl')) return 'office_supplies';
    if (name.includes('rent')) return 'rent';
    if (name.includes('utilit')) return 'utilities';
    if (name.includes('insurance')) return 'insurance';
    if (name.includes('legal')) return 'legal';
    if (name.includes('accounting')) return 'accounting';
    if (name.includes('management') && name.includes('salar')) return 'management_salaries';
    if (name.includes('training')) return 'training';
    if (name.includes('software') || name.includes('subscription')) return 'software';
    if (name.includes('equipment')) return 'equipment';
    if (name.includes('maintenance')) return 'maintenance';
    if (name.includes('professional') || name.includes('consulting')) return 'professional_services';
    return 'other_administrative';
  }

  // Calculate other income from actual transactions
  async calculateOtherIncome(period) {
    // Get account codes dynamically
    const accountCodes = await this.getAccountCodes();
    
    // Find other income accounts (revenue accounts that are not sales revenue)
    const otherIncomeAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'revenue',
      accountCategory: 'other_revenue',
      isActive: true,
      allowDirectPosting: true
    }, {
      select: 'accountCode accountName'
    });
    
    // Also find accounts by name patterns for interest and rental
    const interestAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'revenue',
      isActive: true,
      allowDirectPosting: true,
      $or: [
        { accountName: { $regex: /interest/i } },
        { accountCode: { $regex: /^43/ } } // Common pattern for interest income
      ]
    }, {
      select: 'accountCode accountName'
    });
    
    const rentalAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'revenue',
      isActive: true,
      allowDirectPosting: true,
      accountName: { $regex: /rental|rent/i }
    }, {
      select: 'accountCode accountName'
    });
    
    // Combine all other income account codes
    const allOtherIncomeCodes = [
      ...otherIncomeAccounts.map(acc => acc.accountCode),
      ...interestAccounts.map(acc => acc.accountCode),
      ...rentalAccounts.map(acc => acc.accountCode),
      accountCodes.otherRevenue // Fallback
    ].filter(Boolean);
    
    // Remove duplicates
    const uniqueOtherIncomeCodes = [...new Set(allOtherIncomeCodes)];
    
    // Query all other income transactions
    const otherIncomeTransactions = await TransactionRepository.findAll({
      accountCode: { $in: uniqueOtherIncomeCodes },
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      creditAmount: { $gt: 0 } // Income is credits
    });
    
    // Categorize income
    let interestIncome = 0;
    let rentalIncome = 0;
    let otherIncome = 0;
    
    // Create maps for quick lookup
    const interestAccountCodes = new Set(interestAccounts.map(acc => acc.accountCode));
    const rentalAccountCodes = new Set(rentalAccounts.map(acc => acc.accountCode));
    const otherRevenueAccountCodes = new Set(otherIncomeAccounts.map(acc => acc.accountCode));
    
    otherIncomeTransactions.forEach(transaction => {
      const accountCode = transaction.accountCode;
      const amount = transaction.creditAmount || 0;
      const description = (transaction.description || '').toLowerCase();
      
      // Categorize by account code or description
      if (interestAccountCodes.has(accountCode) || description.includes('interest')) {
        interestIncome += amount;
      } else if (rentalAccountCodes.has(accountCode) || description.includes('rental') || description.includes('rent')) {
        rentalIncome += amount;
      } else {
        // Other income (exclude sales revenue if it somehow got in)
        if (accountCode !== accountCodes.salesRevenue) {
          otherIncome += amount;
        }
      }
    });
    
    return {
      interestIncome,
      rentalIncome,
      other: otherIncome,
    };
  }

  // Calculate other expenses from actual transactions
  async calculateOtherExpenses(period) {
    // Get account codes dynamically
    const accountCodes = await this.getAccountCodes();
    
    // Find other expense accounts (expense accounts that are not operating expenses or COGS)
    const otherExpenseAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'expense',
      accountCategory: 'other_expenses',
      isActive: true,
      allowDirectPosting: true
    }, {
      select: 'accountCode accountName'
    });
    
    // Find accounts by name patterns for interest, depreciation, and amortization
    const interestExpenseAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'expense',
      isActive: true,
      allowDirectPosting: true,
      $or: [
        { accountName: { $regex: /interest/i } },
        { accountCode: { $regex: /^53/ } } // Common pattern for interest expense
      ]
    }, {
      select: 'accountCode accountName'
    });
    
    const depreciationAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'expense',
      isActive: true,
      allowDirectPosting: true,
      accountName: { $regex: /depreciation|depreciat/i }
    }, {
      select: 'accountCode accountName'
    });
    
    const amortizationAccounts = await ChartOfAccountsRepository.findAll({
      accountType: 'expense',
      isActive: true,
      allowDirectPosting: true,
      accountName: { $regex: /amortization|amortiz/i }
    }, {
      select: 'accountCode accountName'
    });
    
    // Combine all other expense account codes
    const allOtherExpenseCodes = [
      ...otherExpenseAccounts.map(acc => acc.accountCode),
      ...interestExpenseAccounts.map(acc => acc.accountCode),
      ...depreciationAccounts.map(acc => acc.accountCode),
      ...amortizationAccounts.map(acc => acc.accountCode),
      accountCodes.otherExpenses // Fallback
    ].filter(Boolean);
    
    // Remove duplicates
    const uniqueOtherExpenseCodes = [...new Set(allOtherExpenseCodes)];
    
    // Query all other expense transactions
    const otherExpenseTransactions = await TransactionRepository.findAll({
      accountCode: { $in: uniqueOtherExpenseCodes },
      createdAt: { $gte: period.startDate, $lte: period.endDate },
      status: 'completed',
      debitAmount: { $gt: 0 } // Expenses are debits
    });
    
    // Categorize expenses
    let interestExpense = 0;
    let depreciation = 0;
    let amortization = 0;
    let otherExpense = 0;
    
    // Create maps for quick lookup
    const interestExpenseAccountCodes = new Set(interestExpenseAccounts.map(acc => acc.accountCode));
    const depreciationAccountCodes = new Set(depreciationAccounts.map(acc => acc.accountCode));
    const amortizationAccountCodes = new Set(amortizationAccounts.map(acc => acc.accountCode));
    const otherExpenseAccountCodes = new Set(otherExpenseAccounts.map(acc => acc.accountCode));
    
    otherExpenseTransactions.forEach(transaction => {
      const accountCode = transaction.accountCode;
      const amount = transaction.debitAmount || 0;
      const description = (transaction.description || '').toLowerCase();
      
      // Categorize by account code or description
      if (interestExpenseAccountCodes.has(accountCode) || description.includes('interest')) {
        interestExpense += amount;
      } else if (depreciationAccountCodes.has(accountCode) || description.includes('depreciation') || description.includes('depreciat')) {
        depreciation += amount;
      } else if (amortizationAccountCodes.has(accountCode) || description.includes('amortization') || description.includes('amortiz')) {
        amortization += amount;
      } else {
        // Other expenses (exclude COGS and operating expenses if they somehow got in)
        if (accountCode !== accountCodes.costOfGoodsSold && 
            !accountCode.startsWith('52')) { // Operating expenses typically start with 52
          otherExpense += amount;
        }
      }
    });
    
    return {
      interestExpense,
      depreciation,
      amortization,
      other: otherExpense,
    };
  }

  // Calculate taxes
  async calculateTaxes(period, earningsBeforeTax = 0) {
    // Calculate all taxes using tax calculation service
    const taxData = await taxCalculationService.calculateAllTaxes(period, earningsBeforeTax);
    
    return {
      salesTax: taxData.salesTax.salesTax,
      incomeTax: taxData.incomeTax.total,
      current: taxData.incomeTax.current,
      deferred: taxData.incomeTax.deferred,
      totalTax: taxData.totalTax,
      salesTaxDetails: taxData.salesTax,
      incomeTaxDetails: taxData.incomeTax
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

      // Add discount details by type
      Object.entries(data.revenue.discountsByType).forEach(([type, amount]) => {
        statement.revenue.salesDiscounts.details.push({
          type,
          amount,
          description: `${type} discounts`,
        });
      });
      
      // Add individual discount transaction details if available
      if (data.revenue.discountDetails && data.revenue.discountDetails.length > 0) {
        // Group discounts by type for better organization
        const discountsByTypeMap = {};
        data.revenue.discountDetails.forEach(detail => {
          if (!discountsByTypeMap[detail.type]) {
            discountsByTypeMap[detail.type] = [];
          }
          discountsByTypeMap[detail.type].push(detail);
        });
        
        // Add to existing discount details or create new entries
        Object.entries(discountsByTypeMap).forEach(([type, details]) => {
          const existingDetail = statement.revenue.salesDiscounts.details.find(d => d.type === type);
          if (existingDetail) {
            // Add transaction details as subcategories
            existingDetail.transactions = details.map(d => ({
              orderNumber: d.orderNumber,
              date: d.date,
              amount: d.amount,
              discountCode: d.discountCode,
            }));
          }
        });
      }
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

    // Set the calculated COGS from transactions (primary method)
    statement.costOfGoodsSold.totalCOGS.amount = data.cogs.totalCOGS;
    statement.costOfGoodsSold.totalCOGS.calculationMethod = 'transaction';
    statement.costOfGoodsSold.totalCOGS.calculation = `Sum of ${data.cogs.cogsDetails?.length || 0} COGS transaction(s)`;

    if (includeDetails) {
      statement.costOfGoodsSold.purchases.details = data.cogs.purchaseDetails;
      // Add COGS transaction details
      statement.costOfGoodsSold.cogsDetails = data.cogs.cogsDetails;
      
      // Add purchase return details if available
      if (data.cogs.purchaseAdjustments?.returnDetails && data.cogs.purchaseAdjustments.returnDetails.length > 0) {
        // Store as array on the statement (will be saved if schema supports it, otherwise ignored)
        statement.costOfGoodsSold.purchaseReturnDetails = data.cogs.purchaseAdjustments.returnDetails;
      }
      
      // Add purchase discount details if available
      if (data.cogs.purchaseAdjustments?.discountDetails && data.cogs.purchaseAdjustments.discountDetails.length > 0) {
        // Store as array on the statement (will be saved if schema supports it, otherwise ignored)
        statement.costOfGoodsSold.purchaseDiscountDetails = data.cogs.purchaseAdjustments.discountDetails;
      }
    }
  }

  // Populate expense data in P&L statement
  async populateExpenseData(statement, data, includeDetails) {
    // Get budget comparison if available
    const budgetComparison = await budgetComparisonService.compareExpensesWithBudget(
      data.expenses,
      statement.period
    );

    // Selling expenses
    let sellingTotal = 0;
    
    // Group transactions by category
    const sellingByCategory = {};
    if (data.expenses.sellingDetails) {
      data.expenses.sellingDetails.forEach(detail => {
        if (!sellingByCategory[detail.category]) {
          sellingByCategory[detail.category] = {
            category: detail.category,
            amount: 0,
            description: `${detail.category.replace('_', ' ')} expenses`,
            transactions: []
          };
        }
        sellingByCategory[detail.category].amount += detail.amount;
        if (includeDetails) {
          sellingByCategory[detail.category].transactions.push({
            date: detail.date,
            amount: detail.amount,
            description: detail.description,
            accountCode: detail.accountCode,
            accountName: detail.accountName,
            reference: detail.reference,
            transactionId: detail.transactionId,
          });
        }
      });
    }
    
    // Add category totals with budget comparison
    Object.values(sellingByCategory).forEach(categoryData => {
      sellingTotal += categoryData.amount;
      const detailEntry = {
        category: categoryData.category,
        amount: categoryData.amount,
        description: categoryData.description,
      };
      
      // Add budget comparison if available
      if (budgetComparison.hasBudget && budgetComparison.sellingExpenses[categoryData.category]) {
        const budgetData = budgetComparison.sellingExpenses[categoryData.category];
        detailEntry.budget = {
          amount: budgetData.budget,
          variance: budgetData.variance,
          variancePercent: budgetData.variancePercent,
          status: budgetData.status
        };
      }
      
      // Add transaction details as subcategories if includeDetails is true
      if (includeDetails && categoryData.transactions.length > 0) {
        detailEntry.subcategories = categoryData.transactions.map(txn => ({
          name: txn.description || `${txn.accountName} - ${txn.reference}`,
          amount: txn.amount,
          date: txn.date,
          transactionId: txn.transactionId,
        }));
      }
      
      statement.operatingExpenses.sellingExpenses.details.push(detailEntry);
    });
    
    statement.operatingExpenses.sellingExpenses.total = sellingTotal;
    
    // Add budget comparison summary for selling expenses
    if (budgetComparison.hasBudget) {
      statement.operatingExpenses.sellingExpenses.budgetComparison = {
        budget: budgetComparison.totals.budget.selling,
        actual: budgetComparison.totals.actual.selling,
        variance: budgetComparison.totals.variance.selling,
        variancePercent: budgetComparison.totals.variancePercent.selling
      };
    }

    // Administrative expenses
    let adminTotal = 0;
    
    // Group transactions by category
    const adminByCategory = {};
    if (data.expenses.administrativeDetails) {
      data.expenses.administrativeDetails.forEach(detail => {
        if (!adminByCategory[detail.category]) {
          adminByCategory[detail.category] = {
            category: detail.category,
            amount: 0,
            description: `${detail.category.replace('_', ' ')} expenses`,
            transactions: []
          };
        }
        adminByCategory[detail.category].amount += detail.amount;
        if (includeDetails) {
          adminByCategory[detail.category].transactions.push({
            date: detail.date,
            amount: detail.amount,
            description: detail.description,
            accountCode: detail.accountCode,
            accountName: detail.accountName,
            reference: detail.reference,
            transactionId: detail.transactionId,
          });
        }
      });
    }
    
    // Add category totals with budget comparison
    Object.values(adminByCategory).forEach(categoryData => {
      adminTotal += categoryData.amount;
      const detailEntry = {
        category: categoryData.category,
        amount: categoryData.amount,
        description: categoryData.description,
      };
      
      // Add budget comparison if available
      if (budgetComparison.hasBudget && budgetComparison.administrativeExpenses[categoryData.category]) {
        const budgetData = budgetComparison.administrativeExpenses[categoryData.category];
        detailEntry.budget = {
          amount: budgetData.budget,
          variance: budgetData.variance,
          variancePercent: budgetData.variancePercent,
          status: budgetData.status
        };
      }
      
      // Add transaction details as subcategories if includeDetails is true
      if (includeDetails && categoryData.transactions.length > 0) {
        detailEntry.subcategories = categoryData.transactions.map(txn => ({
          name: txn.description || `${txn.accountName} - ${txn.reference}`,
          amount: txn.amount,
          date: txn.date,
          transactionId: txn.transactionId,
        }));
      }
      
      statement.operatingExpenses.administrativeExpenses.details.push(detailEntry);
    });
    
    statement.operatingExpenses.administrativeExpenses.total = adminTotal;
    
    // Add budget comparison summary for administrative expenses
    if (budgetComparison.hasBudget) {
      statement.operatingExpenses.administrativeExpenses.budgetComparison = {
        budget: budgetComparison.totals.budget.administrative,
        actual: budgetComparison.totals.actual.administrative,
        variance: budgetComparison.totals.variance.administrative,
        variancePercent: budgetComparison.totals.variancePercent.administrative
      };
      
      // Add overall budget comparison
      statement.operatingExpenses.budgetComparison = {
        budget: budgetComparison.totals.budget.total,
        actual: budgetComparison.totals.actual.total,
        variance: budgetComparison.totals.variance.total,
        variancePercent: budgetComparison.totals.variancePercent.total,
        budgetId: budgetComparison.budgetId,
        budgetName: budgetComparison.budgetName
      };
    }
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

    // Populate tax data
    statement.incomeTax.current = data.taxes.incomeTax;
    statement.incomeTax.deferred = data.taxes.deferred;
    
    // Add sales tax and tax details if available
    if (data.taxes.salesTaxDetails) {
      statement.salesTax = {
        amount: data.taxes.salesTax,
        taxableSales: data.taxes.salesTaxDetails.taxableSales,
        taxExemptSales: data.taxes.salesTaxDetails.taxExemptSales,
        taxByMonth: data.taxes.salesTaxDetails.taxByMonth,
        source: data.taxes.salesTaxDetails.source
      };
    }
    
    if (data.taxes.incomeTaxDetails && includeDetails) {
      statement.incomeTax.details = {
        effectiveRate: data.taxes.incomeTaxDetails.effectiveRate,
        calculation: data.taxes.incomeTaxDetails.calculation,
        bracketDetails: data.taxes.incomeTaxDetails.bracketDetails
      };
    }
  }

  // Add comparisons to P&L statement
  async addComparisons(statement) {
    try {
      // Get previous period statement
      const previousStatement = await FinancialStatementRepository.findOne({
        type: 'profit_loss',
        'period.endDate': { $lt: statement.period.startDate },
      }, {
        sort: { 'period.endDate': -1 }
      });

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
      const budgetStatement = await FinancialStatementRepository.findOne({
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
    const statements = await FinancialStatementRepository.findAll({
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
