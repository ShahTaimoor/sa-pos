const mongoose = require('mongoose');

const balanceSheetSchema = new mongoose.Schema({
  statementNumber: {
    type: String,
    unique: true,
    required: true
  },
  statementDate: {
    type: Date,
    required: true
  },
  periodType: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    required: true,
    default: 'monthly'
  },
  status: {
    type: String,
    enum: ['draft', 'review', 'approved', 'final'],
    default: 'draft'
  },
  
  // ASSETS
  assets: {
    currentAssets: {
      cashAndCashEquivalents: {
        cashOnHand: { type: Number, default: 0 },
        bankAccounts: { type: Number, default: 0 },
        pettyCash: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      accountsReceivable: {
        tradeReceivables: { type: Number, default: 0 },
        otherReceivables: { type: Number, default: 0 },
        allowanceForDoubtfulAccounts: { type: Number, default: 0 },
        netReceivables: { type: Number, default: 0 }
      },
      inventory: {
        rawMaterials: { type: Number, default: 0 },
        workInProgress: { type: Number, default: 0 },
        finishedGoods: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      prepaidExpenses: { type: Number, default: 0 },
      otherCurrentAssets: { type: Number, default: 0 },
      totalCurrentAssets: { type: Number, default: 0 }
    },
    fixedAssets: {
      propertyPlantEquipment: {
        land: { type: Number, default: 0 },
        buildings: { type: Number, default: 0 },
        equipment: { type: Number, default: 0 },
        vehicles: { type: Number, default: 0 },
        furnitureAndFixtures: { type: Number, default: 0 },
        computerEquipment: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      accumulatedDepreciation: { type: Number, default: 0 },
      netPropertyPlantEquipment: { type: Number, default: 0 },
      intangibleAssets: {
        goodwill: { type: Number, default: 0 },
        patents: { type: Number, default: 0 },
        trademarks: { type: Number, default: 0 },
        software: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      longTermInvestments: { type: Number, default: 0 },
      otherAssets: { type: Number, default: 0 },
      totalFixedAssets: { type: Number, default: 0 }
    },
    totalAssets: { type: Number, default: 0 }
  },

  // LIABILITIES
  liabilities: {
    currentLiabilities: {
      accountsPayable: {
        tradePayables: { type: Number, default: 0 },
        otherPayables: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      accruedExpenses: {
        salariesPayable: { type: Number, default: 0 },
        utilitiesPayable: { type: Number, default: 0 },
        rentPayable: { type: Number, default: 0 },
        taxesPayable: { type: Number, default: 0 },
        interestPayable: { type: Number, default: 0 },
        otherAccruedExpenses: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      shortTermDebt: {
        creditLines: { type: Number, default: 0 },
        shortTermLoans: { type: Number, default: 0 },
        creditCardDebt: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      deferredRevenue: { type: Number, default: 0 },
      otherCurrentLiabilities: { type: Number, default: 0 },
      totalCurrentLiabilities: { type: Number, default: 0 }
    },
    longTermLiabilities: {
      longTermDebt: {
        mortgages: { type: Number, default: 0 },
        longTermLoans: { type: Number, default: 0 },
        bondsPayable: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      deferredTaxLiabilities: { type: Number, default: 0 },
      pensionLiabilities: { type: Number, default: 0 },
      otherLongTermLiabilities: { type: Number, default: 0 },
      totalLongTermLiabilities: { type: Number, default: 0 }
    },
    totalLiabilities: { type: Number, default: 0 }
  },

  // EQUITY
  equity: {
    contributedCapital: {
      commonStock: { type: Number, default: 0 },
      preferredStock: { type: Number, default: 0 },
      additionalPaidInCapital: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    retainedEarnings: {
      beginningRetainedEarnings: { type: Number, default: 0 },
      currentPeriodEarnings: { type: Number, default: 0 },
      dividendsPaid: { type: Number, default: 0 },
      endingRetainedEarnings: { type: Number, default: 0 }
    },
    otherEquity: {
      treasuryStock: { type: Number, default: 0 },
      accumulatedOtherComprehensiveIncome: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    totalEquity: { type: Number, default: 0 }
  },

  // FINANCIAL RATIOS
  ratios: {
    currentRatio: { type: Number, default: 0 },
    quickRatio: { type: Number, default: 0 },
    debtToEquityRatio: { type: Number, default: 0 },
    returnOnAssets: { type: Number, default: 0 },
    returnOnEquity: { type: Number, default: 0 },
    inventoryTurnover: { type: Number, default: 0 },
    accountsReceivableTurnover: { type: Number, default: 0 },
    accountsPayableTurnover: { type: Number, default: 0 }
  },

  // METADATA
  metadata: {
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    generatedAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    notes: { type: String, default: '' }
  },

  // AUDIT TRAIL
  auditTrail: [{
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedAt: { type: Date, default: Date.now },
    details: { type: String, default: '' },
    changes: { type: mongoose.Schema.Types.Mixed }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
balanceSheetSchema.index({ statementNumber: 1 });
balanceSheetSchema.index({ statementDate: 1 });
balanceSheetSchema.index({ periodType: 1 });
balanceSheetSchema.index({ status: 1 });

// Virtual for total assets = total liabilities + total equity
balanceSheetSchema.virtual('isBalanced').get(function() {
  const tolerance = 0.01; // Allow for small rounding differences
  const difference = Math.abs(this.assets.totalAssets - (this.liabilities.totalLiabilities + this.equity.totalEquity));
  return difference <= tolerance;
});

// Method to add audit trail entry
balanceSheetSchema.methods.addAuditEntry = function(action, performedBy, details = '', changes = null) {
  this.auditTrail.push({
    action,
    performedBy,
    details,
    changes,
    performedAt: new Date()
  });
  // Return promise to maintain API compatibility with callers that await this method
  return this.save();
};

// Method to update status
balanceSheetSchema.methods.updateStatus = async function(newStatus, performedBy, details = '') {
  const oldStatus = this.status;
  this.status = newStatus;
  // addAuditEntry returns a promise (saves internally) - return it for proper promise chaining
  return await this.addAuditEntry('status_changed', performedBy, details, { from: oldStatus, to: newStatus });
};

// Method to calculate all intermediate totals
balanceSheetSchema.methods.calculateTotals = function() {
  // Calculate cash and cash equivalents total
  if (this.assets?.currentAssets?.cashAndCashEquivalents) {
    const cash = this.assets.currentAssets.cashAndCashEquivalents;
    cash.total = (cash.cashOnHand || 0) + (cash.bankAccounts || 0) + (cash.pettyCash || 0);
  }

  // Calculate accounts receivable net receivables
  if (this.assets?.currentAssets?.accountsReceivable) {
    const ar = this.assets.currentAssets.accountsReceivable;
    ar.netReceivables = ((ar.tradeReceivables || 0) + (ar.otherReceivables || 0)) - (ar.allowanceForDoubtfulAccounts || 0);
  }

  // Calculate inventory total
  if (this.assets?.currentAssets?.inventory) {
    const inv = this.assets.currentAssets.inventory;
    inv.total = (inv.rawMaterials || 0) + (inv.workInProgress || 0) + (inv.finishedGoods || 0);
  }

  // Calculate total current assets
  if (this.assets?.currentAssets) {
    const ca = this.assets.currentAssets;
    ca.totalCurrentAssets = 
      (ca.cashAndCashEquivalents?.total || 0) +
      (ca.accountsReceivable?.netReceivables || 0) +
      (ca.inventory?.total || 0) +
      (ca.prepaidExpenses || 0) +
      (ca.otherCurrentAssets || 0);
  }

  // Calculate property, plant, and equipment total
  if (this.assets?.fixedAssets?.propertyPlantEquipment) {
    const ppe = this.assets.fixedAssets.propertyPlantEquipment;
    ppe.total = 
      (ppe.land || 0) +
      (ppe.buildings || 0) +
      (ppe.equipment || 0) +
      (ppe.vehicles || 0) +
      (ppe.furnitureAndFixtures || 0) +
      (ppe.computerEquipment || 0);
  }

  // Calculate net property, plant, and equipment
  if (this.assets?.fixedAssets) {
    const fa = this.assets.fixedAssets;
    fa.netPropertyPlantEquipment = 
      (fa.propertyPlantEquipment?.total || 0) - (fa.accumulatedDepreciation || 0);
  }

  // Calculate intangible assets total
  if (this.assets?.fixedAssets?.intangibleAssets) {
    const ia = this.assets.fixedAssets.intangibleAssets;
    ia.total = 
      (ia.goodwill || 0) +
      (ia.patents || 0) +
      (ia.trademarks || 0) +
      (ia.software || 0);
  }

  // Calculate total fixed assets
  if (this.assets?.fixedAssets) {
    const fa = this.assets.fixedAssets;
    fa.totalFixedAssets = 
      (fa.netPropertyPlantEquipment || 0) +
      (fa.intangibleAssets?.total || 0) +
      (fa.longTermInvestments || 0) +
      (fa.otherAssets || 0);
  }

  // Calculate total assets
  if (this.assets) {
    this.assets.totalAssets = 
      (this.assets.currentAssets?.totalCurrentAssets || 0) +
      (this.assets.fixedAssets?.totalFixedAssets || 0);
  }

  // Calculate accounts payable total
  if (this.liabilities?.currentLiabilities?.accountsPayable) {
    const ap = this.liabilities.currentLiabilities.accountsPayable;
    ap.total = (ap.tradePayables || 0) + (ap.otherPayables || 0);
  }

  // Calculate accrued expenses total
  if (this.liabilities?.currentLiabilities?.accruedExpenses) {
    const ae = this.liabilities.currentLiabilities.accruedExpenses;
    ae.total = 
      (ae.salariesPayable || 0) +
      (ae.utilitiesPayable || 0) +
      (ae.rentPayable || 0) +
      (ae.taxesPayable || 0) +
      (ae.interestPayable || 0) +
      (ae.otherAccruedExpenses || 0);
  }

  // Calculate short-term debt total
  if (this.liabilities?.currentLiabilities?.shortTermDebt) {
    const std = this.liabilities.currentLiabilities.shortTermDebt;
    std.total = 
      (std.creditLines || 0) +
      (std.shortTermLoans || 0) +
      (std.creditCardDebt || 0);
  }

  // Calculate total current liabilities
  if (this.liabilities?.currentLiabilities) {
    const cl = this.liabilities.currentLiabilities;
    cl.totalCurrentLiabilities = 
      (cl.accountsPayable?.total || 0) +
      (cl.accruedExpenses?.total || 0) +
      (cl.shortTermDebt?.total || 0) +
      (cl.deferredRevenue || 0) +
      (cl.otherCurrentLiabilities || 0);
  }

  // Calculate long-term debt total
  if (this.liabilities?.longTermLiabilities?.longTermDebt) {
    const ltd = this.liabilities.longTermLiabilities.longTermDebt;
    ltd.total = 
      (ltd.mortgages || 0) +
      (ltd.longTermLoans || 0) +
      (ltd.bondsPayable || 0);
  }

  // Calculate total long-term liabilities
  if (this.liabilities?.longTermLiabilities) {
    const ltl = this.liabilities.longTermLiabilities;
    ltl.totalLongTermLiabilities = 
      (ltl.longTermDebt?.total || 0) +
      (ltl.deferredTaxLiabilities || 0) +
      (ltl.pensionLiabilities || 0) +
      (ltl.otherLongTermLiabilities || 0);
  }

  // Calculate total liabilities
  if (this.liabilities) {
    this.liabilities.totalLiabilities = 
      (this.liabilities.currentLiabilities?.totalCurrentLiabilities || 0) +
      (this.liabilities.longTermLiabilities?.totalLongTermLiabilities || 0);
  }

  // Calculate contributed capital total
  if (this.equity?.contributedCapital) {
    const cc = this.equity.contributedCapital;
    cc.total = 
      (cc.commonStock || 0) +
      (cc.preferredStock || 0) +
      (cc.additionalPaidInCapital || 0);
  }

  // Calculate ending retained earnings
  if (this.equity?.retainedEarnings) {
    const re = this.equity.retainedEarnings;
    re.endingRetainedEarnings = 
      (re.beginningRetainedEarnings || 0) +
      (re.currentPeriodEarnings || 0) -
      (re.dividendsPaid || 0);
  }

  // Calculate other equity total
  if (this.equity?.otherEquity) {
    const oe = this.equity.otherEquity;
    oe.total = 
      (oe.treasuryStock || 0) +
      (oe.accumulatedOtherComprehensiveIncome || 0);
  }

  // Calculate total equity
  if (this.equity) {
    this.equity.totalEquity = 
      (this.equity.contributedCapital?.total || 0) +
      (this.equity.retainedEarnings?.endingRetainedEarnings || 0) +
      (this.equity.otherEquity?.total || 0);
  }
};

// Method to calculate financial ratios
balanceSheetSchema.methods.calculateRatios = async function() {
  const ratios = {
    currentRatio: 0,
    quickRatio: 0,
    debtToEquityRatio: 0,
    returnOnAssets: 0,
    returnOnEquity: 0,
    inventoryTurnover: 0,
    accountsReceivableTurnover: 0,
    accountsPayableTurnover: 0
  };

  // Get values from balance sheet
  const currentAssets = this.assets?.currentAssets?.totalCurrentAssets || 0;
  const currentLiabilities = this.liabilities?.currentLiabilities?.totalCurrentLiabilities || 0;
  const inventory = this.assets?.currentAssets?.inventory?.total || 0;
  const totalAssets = this.assets?.totalAssets || 0;
  const totalLiabilities = this.liabilities?.totalLiabilities || 0;
  const totalEquity = this.equity?.totalEquity || 0;
  const accountsReceivable = this.assets?.currentAssets?.accountsReceivable?.netReceivables || 0;
  const accountsPayable = this.liabilities?.currentLiabilities?.accountsPayable?.total || 0;

  // 1. Current Ratio = Current Assets / Current Liabilities
  if (currentLiabilities > 0) {
    ratios.currentRatio = currentAssets / currentLiabilities;
  }

  // 2. Quick Ratio = (Current Assets - Inventory) / Current Liabilities
  if (currentLiabilities > 0) {
    ratios.quickRatio = (currentAssets - inventory) / currentLiabilities;
  }

  // 3. Debt to Equity Ratio = Total Liabilities / Total Equity
  if (totalEquity > 0) {
    ratios.debtToEquityRatio = totalLiabilities / totalEquity;
  }

  // 4. Return on Assets = Net Income / Total Assets
  // Requires net income from P&L statement - will be calculated if available
  // For now, we can use current period earnings as a proxy
  const netIncome = this.equity?.retainedEarnings?.currentPeriodEarnings || 0;
  if (totalAssets > 0) {
    ratios.returnOnAssets = netIncome / totalAssets;
  }

  // 5. Return on Equity = Net Income / Total Equity
  if (totalEquity > 0) {
    ratios.returnOnEquity = netIncome / totalEquity;
  }

  // 6. Inventory Turnover = COGS / Average Inventory
  // Requires COGS from P&L statement - will be 0 if not available
  // This would need to be calculated from P&L data if available
  // For now, set to 0 (would need external calculation)

  // 7. Accounts Receivable Turnover = Net Sales / Average Accounts Receivable
  // Requires sales data - will be 0 if not available
  // This would need to be calculated from sales data if available
  // For now, set to 0 (would need external calculation)

  // 8. Accounts Payable Turnover = COGS / Average Accounts Payable
  // Requires COGS from P&L statement - will be 0 if not available
  // This would need to be calculated from P&L data if available
  // For now, set to 0 (would need external calculation)

  return ratios;
};

// Pre-save hook to calculate totals and ratios before saving
balanceSheetSchema.pre('save', async function(next) {
  try {
    // Step 1: Calculate all intermediate totals first
    // This must happen before ratio calculations since ratios depend on these totals
    this.calculateTotals();

    // Step 2: Calculate financial ratios after totals are computed
    // Only calculate ratios if the balance sheet has been populated with data
    // Check if at least one major section has non-zero values
    const hasData = 
      (this.assets?.totalAssets > 0) || 
      (this.liabilities?.totalLiabilities > 0) || 
      (this.equity?.totalEquity > 0);

    if (hasData) {
      // Note: calculateRatios() only uses values from this document (this.assets, this.liabilities, etc.)
      // It does not query external collections, so there's no race condition risk.
      // If future changes add external queries, ensure they complete before document save.
      const calculatedRatios = await this.calculateRatios();
      this.ratios = calculatedRatios;
    }
  } catch (error) {
    console.error('Error calculating balance sheet totals or ratios:', error);
    // Don't fail the save if calculation fails
    // Totals and ratios will remain at default 0 values
  }
  
  next();
});

module.exports = mongoose.model('BalanceSheet', balanceSheetSchema);
