const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { createRateLimiter } = require('./middleware/rateLimit');
const { seedBasicAccounts } = require('./services/accountSeeder');

// Load environment variables
require('dotenv').config();

// Set default environment variables if not provided
// Note: MONGODB_URI must be provided via environment variable or .env file
// Never hardcode credentials in source code
process.env.JWT_SECRET = process.env.JWT_SECRET || '';
process.env.PORT = process.env.PORT || 5000;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// MONGODB_URI must be set via environment variable - no default fallback for security
if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}

const app = express();

// Security hard-stop: require a non-empty JWT secret in non-test environments
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('FATAL: JWT_SECRET is not set. Please configure it in .env');
  // Exit only when running as a standalone server (avoid crashing in serverless imports)
  if (!process.env.VERCEL) {
    process.exit(1);
  }
}

// Strict CORS Configuration
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
if (!isDev && allowedOrigins.length === 0) {
  console.error('FATAL: FRONTEND_URL or FRONTEND_URLS must be set in production for CORS');
  if (!process.env.VERCEL) process.exit(1);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isDev) return callback(null, true);
    if (!origin) return callback(null, false);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));

// Global rate limiter (e.g., 300 requests per 5 minutes per IP)
app.use(createRateLimiter({ windowMs: 5 * 60_000, max: 300 }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

// Database connection with serverless optimization
const mongoUri = process.env.MONGODB_URI;

// Validate connection string has database name
if (mongoUri && !mongoUri.includes('/pos_system') && !mongoUri.includes('/test')) {
  console.warn('⚠️  WARNING: Connection string may be missing database name. Adding /pos_system');
}

// Connection options optimized for serverless
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000,
  dbName: 'pos_system' // Explicitly set database name to prevent defaulting to 'test'
};

// Database connection helper
let dbConnected = false;

// Only connect if not already connected (important for serverless)
if (mongoose.connection.readyState === 0) {
  mongoose.connect(mongoUri, mongooseOptions)
    .then(async () => {
      dbConnected = true;
      const dbName = mongoose.connection.db.databaseName;
      console.log(`✅ MongoDB connected successfully to database: ${dbName}`);
      
      if (dbName === 'test') {
        console.error('❌ ERROR: Connected to "test" database instead of "pos_system"!');
        console.error('💡 Check your MONGODB_URI in .env file - it should end with /pos_system');
      }
      
      await seedBasicAccounts();
    })
    .catch(err => {
      console.error('❌ MongoDB connection error:', err);
      console.error('💡 Verify that the connection string is correct and accessible.');
      console.error('💡 For local MongoDB, ensure MongoDB service is running.');
      console.error('💡 For Atlas, ensure your IP is whitelisted.');
    });
} else if (mongoose.connection.readyState === 1) {
  dbConnected = true;
}

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server and scheduler in non-serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 POS Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Start backup scheduler (only in non-serverless environments)
  const backupScheduler = require('./services/backupScheduler');
  backupScheduler.start();
}
