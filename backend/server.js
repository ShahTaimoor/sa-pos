const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config();

// Validate environment variables
const { validateEnv } = require('./config/env');
try {
  validateEnv();
} catch (error) {
  // Exit only when running as a standalone server (avoid crashing in serverless imports)
  if (!process.env.VERCEL) {
    process.exit(1);
  }
}

const app = express();

// Security middleware
app.use(helmet());

// Compression middleware (compress responses)
app.use(compression());

// Request ID middleware (add unique ID to each request for tracking)
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging middleware (should be early in the middleware chain)
const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger);

// Global rate limiting - protect all API endpoints
const { createRateLimiter } = require('./middleware/rateLimit');
// General API rate limiter: 100 requests per minute per IP
app.use('/api', createRateLimiter({ 
  windowMs: 60000, // 1 minute
  max: 100 // 100 requests per minute
}));
// Stricter rate limiter for auth endpoints: 5 requests per minute per IP
app.use('/api/auth', createRateLimiter({ 
  windowMs: 60000, // 1 minute
  max: 5 // 5 requests per minute (prevents brute force)
}));

// CORS configuration - use environment variable for allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'https://sa.wiserconsulting.info',
      'http://localhost:3000', // Allow local development
      'http://localhost:5173', // Allow Vite dev server
      process.env.FRONTEND_URL // Allow from environment variable if set
    ].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'Idempotency-Key', 'idempotency-key'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Cookie parsing middleware (for HTTP-only cookies)
app.use(cookieParser());

// Idempotency key middleware - prevents duplicate requests
// Note: This middleware uses in-memory storage - consider Redis for production scaling
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
  logger.error('Failed to initialize database:', err);
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
app.use('/api/customer-balances', require('./routes/customerBalances'));
app.use('/api/supplier-balances', require('./routes/supplierBalances'));
app.use('/api/accounting', require('./routes/accounting'));

// Health check endpoint (API version)
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[dbStatus] || 'unknown';

  res.json({ 
    status: dbStatus === 1 ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatusText,
      connected: dbStatus === 1
    },
    uptime: process.uptime()
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
    logger.info(`POS Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Handle port already in use error
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`ERROR: Port ${PORT} is already in use!`);
      logger.error('Solutions:');
      logger.error(`  1. Kill the process using port ${PORT}:`);
      logger.error(`     Windows: netstat -ano | findstr :${PORT}`);
      logger.error(`     Then: taskkill /PID <PID> /F`);
      logger.error(`  2. Or use a different port:`);
      logger.error(`     PORT=5001 npm start`);
      logger.info(`Finding process on port ${PORT}...`);
      
      // Try to find and suggest killing the process
      const { exec } = require('child_process');
      exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n');
          const listeningLine = lines.find(line => line.includes('LISTENING'));
          if (listeningLine) {
            const pid = listeningLine.trim().split(/\s+/).pop();
            if (pid && pid !== '0') {
              logger.error(`Found process PID: ${pid}`);
              logger.error(`Kill it with: taskkill /PID ${pid} /F`);
            }
          }
        }
      });
      
      process.exit(1);
    } else {
      logger.error('Server error:', error);
      process.exit(1);
    }
  });

  // Start backup scheduler (only in non-serverless environments)
  const backupScheduler = require('./services/backupScheduler');
  backupScheduler.start();
}
