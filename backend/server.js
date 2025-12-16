const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Load environment variables
require('dotenv').config();

// Set default environment variables if not provided
process.env.JWT_SECRET = process.env.JWT_SECRET || '';
process.env.PORT = process.env.PORT || 5000;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// Security hard-stop: require a non-empty JWT secret in non-test environments
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('FATAL: JWT_SECRET is not set. Please configure it in .env');
  // Exit only when running as a standalone server (avoid crashing in serverless imports)
  if (!process.env.VERCEL) {
    process.exit(1);
  }
}

// Security middleware
app.use(helmet());

// CORS configuration - allow requests from https://sa.wiserconsulting.info
app.use(cors({
  origin: [
    'https://sa.wiserconsulting.info',
    'http://localhost:3000', // Allow local development
    'http://localhost:5173', // Allow Vite dev server
    process.env.FRONTEND_URL // Allow from environment variable if set
  ].filter(Boolean), // Remove undefined values
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Idempotency key middleware - prevents duplicate requests
const { preventDuplicates } = require('./middleware/duplicatePrevention');
app.use(preventDuplicates({
  windowMs: 60000, // 60 second window for idempotency
  requireIdempotencyKey: false // Auto-generate if not provided, but allow explicit keys
}));

// Middleware to check database connection before handling API requests (except health check)
app.use((req, res, next) => {
  // Allow health check endpoint without database connection
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  // Check if MongoDB is connected
  if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
    return res.status(503).json({ 
      message: 'Database connection not available. Please wait for the server to connect.',
      error: 'Database connection pending',
      readyState: mongoose.connection.readyState
    });
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'POS Backend Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000
  });
});

// Connect to database
connectDB().catch(err => {
  console.error('❌ Failed to initialize database:', err);
});

// Serve static files for exports (if needed)
const path = require('path');
app.use('/exports', express.static(path.join(__dirname, 'exports')));

// Serve optimized images
app.use('/api/images', express.static(path.join(__dirname, 'uploads/images/optimized')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/product-variants', require('./routes/productVariants'));
app.use('/api/product-transformations', require('./routes/productTransformations'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/customer-analytics', require('./routes/customerAnalytics'));
app.use('/api/anomaly-detection', require('./routes/anomalyDetection'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/inventory-alerts', require('./routes/inventoryAlerts'));
app.use('/api/purchase-invoices', require('./routes/purchaseInvoices'));
app.use('/api/purchase-returns', require('./routes/purchaseReturns'));
app.use('/api/sales-orders', require('./routes/salesOrders'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/migration', require('./routes/migration'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/pl-statements', require('./routes/plStatements')); // New P&L statements routes
app.use('/api/reports', require('./routes/reports'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/recurring-expenses', require('./routes/recurringExpenses'));
app.use('/api/balance-sheets', require('./routes/balanceSheets'));
app.use('/api/discounts', require('./routes/discounts'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/sales-performance', require('./routes/salesPerformance'));
app.use('/api/inventory-reports', require('./routes/inventoryReports'));
app.use('/api/cash-receipts', require('./routes/cashReceipts'));
app.use('/api/cash-payments', require('./routes/cashPayments'));
app.use('/api/bank-receipts', require('./routes/bankReceipts'));
app.use('/api/bank-payments', require('./routes/bankPayments'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chart-of-accounts', require('./routes/chartOfAccounts'));
app.use('/api/account-categories', require('./routes/accountCategories'));
app.use('/api/account-ledger', require('./routes/accountLedger'));
app.use('/api/images', require('./routes/images'));
app.use('/api/backdate-report', require('./routes/backdateReport'));
app.use('/api/stock-movements', require('./routes/stockMovements'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/tills', require('./routes/tills'));
app.use('/api/investors', require('./routes/investors'));
app.use('/api/drop-shipping', require('./routes/dropShipping'));
app.use('/api/journal-vouchers', require('./routes/journalVouchers'));
// app.use('/api/customer-balances', require('./routes/customerBalances')); // Temporarily disabled
// app.use('/api/supplier-balances', require('./routes/supplierBalances')); // Temporarily disabled
// app.use('/api/accounting', require('./routes/accounting')); // Temporarily disabled

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Global error handling middleware (must be after all routes)
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server and scheduler in non-serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`🚀 POS Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Handle port already in use error
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
      console.error(`\n💡 Solutions:`);
      console.error(`   1. Kill the process using port ${PORT}:`);
      console.error(`      Windows: netstat -ano | findstr :${PORT}`);
      console.error(`      Then: taskkill /PID <PID> /F`);
      console.error(`   2. Or use a different port:`);
      console.error(`      PORT=5001 npm start`);
      console.error(`\n🔍 Finding process on port ${PORT}...`);
      
      // Try to find and suggest killing the process
      const { exec } = require('child_process');
      exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n');
          const listeningLine = lines.find(line => line.includes('LISTENING'));
          if (listeningLine) {
            const pid = listeningLine.trim().split(/\s+/).pop();
            if (pid && pid !== '0') {
              console.error(`\n   Found process PID: ${pid}`);
              console.error(`   Kill it with: taskkill /PID ${pid} /F`);
            }
          }
        }
      });
      
      process.exit(1);
    } else {
      console.error('❌ Server error:', error);
      process.exit(1);
    }
  });

  // Start backup scheduler (only in non-serverless environments)
  const backupScheduler = require('./services/backupScheduler');
  backupScheduler.start();
}
