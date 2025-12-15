const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const { auth, requirePermission } = require('../middleware/auth');
const ledgerAccountService = require('../services/ledgerAccountService');

// Helper function to transform customer names to uppercase
const transformCustomerToUppercase = (customer) => {
  if (!customer) return customer;
  if (customer.toObject) customer = customer.toObject();
  if (customer.name) customer.name = customer.name.toUpperCase();
  if (customer.businessName) customer.businessName = customer.businessName.toUpperCase();
  if (customer.firstName) customer.firstName = customer.firstName.toUpperCase();
  if (customer.lastName) customer.lastName = customer.lastName.toUpperCase();
  return customer;
};

const router = express.Router();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const validateCustomerIdParam = (req, res, next) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }
  next();
};

const isTransactionNotSupportedError = (error) => {
  if (!error) return false;
  const message = error.message || '';
  return error.code === 20 ||
    error.codeName === 'IllegalOperation' ||
    message.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('transactions are not supported');
};

const runWithOptionalTransaction = async (operation, context = 'operation') => {
  let session = null;
  let transactionStarted = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    transactionStarted = true;

    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (transactionStarted && session) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error(`Failed to abort transaction for ${context}:`, abortError);
      }
    }

    if (!transactionStarted && isTransactionNotSupportedError(error)) {
      console.warn(`Transactions not supported for MongoDB deployment. Retrying ${context} without session.`);
      return await operation(null);
    }

    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const applyOpeningBalance = (customer, openingBalance) => {
  if (openingBalance === null) return;
  customer.openingBalance = openingBalance;
  if (openingBalance >= 0) {
    // Positive opening balance: customer owes us money
    customer.pendingBalance = openingBalance;
    customer.advanceBalance = 0;
  } else {
    // Negative opening balance: we owe customer money (credit/advance)
    customer.pendingBalance = 0;
    customer.advanceBalance = Math.abs(openingBalance);
  }
  // Current balance = what customer owes us minus what we owe them
  customer.currentBalance = customer.pendingBalance - (customer.advanceBalance || 0);
};

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// @route   GET /api/customers
// @desc    Get all customers with filtering and pagination
// @access  Private
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('businessType').optional().isIn(['retail', 'wholesale', 'distributor', 'individual']),
  query('status').optional().isIn(['active', 'inactive', 'suspended']),
  query('customerTier').optional().isIn(['bronze', 'silver', 'gold', 'platinum']),
  query('emailStatus').optional().isIn(['verified', 'unverified', 'no-email']),
  query('phoneStatus').optional().isIn(['verified', 'unverified', 'no-phone'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { businessName: { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.businessType) {
      filter.businessType = req.query.businessType;
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.customerTier) {
      filter.customerTier = req.query.customerTier;
    }

    // Email status filter
    if (req.query.emailStatus) {
      switch (req.query.emailStatus) {
        case 'verified':
          filter.emailVerified = true;
          break;
        case 'unverified':
          filter.emailVerified = false;
          filter.email = { $exists: true, $ne: '' };
          break;
        case 'no-email':
          filter.$or = [
            { email: { $exists: false } },
            { email: '' },
            { email: null }
          ];
          break;
      }
    }

    // Phone status filter
    if (req.query.phoneStatus) {
      switch (req.query.phoneStatus) {
        case 'verified':
          filter.phoneVerified = true;
          break;
        case 'unverified':
          filter.phoneVerified = false;
          filter.phone = { $exists: true, $ne: '' };
          break;
        case 'no-phone':
          filter.$or = [
            { phone: { $exists: false } },
            { phone: '' },
            { phone: null }
          ];
          break;
      }
    }
    
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Customer.countDocuments(filter);
    
    // Transform customer names to uppercase
    const transformedCustomers = customers.map(transformCustomerToUppercase);
    
    res.json({
      customers: transformedCustomers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/customers/cities
// @desc    Get all unique cities from customer addresses
// @access  Private
router.get('/cities', [
  auth,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const customers = await Customer.find({}, 'addresses');
    
    // Extract unique cities from all customer addresses
    const citiesSet = new Set();
    customers.forEach(customer => {
      if (customer.addresses && Array.isArray(customer.addresses)) {
        customer.addresses.forEach(address => {
          if (address.city && address.city.trim()) {
            citiesSet.add(address.city.trim());
          }
        });
      }
    });
    
    const cities = Array.from(citiesSet).sort();
    
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/customers/by-cities
// @desc    Get customers filtered by cities
// @access  Private
router.get('/by-cities', [
  auth,
  requirePermission('view_reports'),
  query('cities').optional().isString().withMessage('Cities must be a comma-separated string'),
  query('showZeroBalance').optional().isIn(['true', 'false']).withMessage('showZeroBalance must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const citiesParam = req.query.cities;
    const showZeroBalance = req.query.showZeroBalance === 'true';
    
    // Build filter
    let filter = {};
    
    if (citiesParam) {
      const citiesArray = citiesParam.split(',').map(c => c.trim()).filter(c => c);
      if (citiesArray.length > 0) {
        filter['addresses.city'] = { $in: citiesArray };
      }
    }
    
    // Get customers with their addresses
    let customers = await Customer.find(filter)
      .select('name businessName addresses currentBalance pendingBalance advanceBalance')
      .sort({ businessName: 1 });
    
    // Filter customers by city and balance
    const filteredCustomers = customers.filter(customer => {
      // Check if customer has at least one address matching the selected cities
      if (citiesParam) {
        const citiesArray = citiesParam.split(',').map(c => c.trim()).filter(c => c);
        const hasMatchingCity = customer.addresses && customer.addresses.some(addr => 
          addr.city && citiesArray.includes(addr.city.trim())
        );
        if (!hasMatchingCity) return false;
      }
      
      // Filter by balance if showZeroBalance is false
      if (!showZeroBalance) {
        const balance = customer.pendingBalance || 0;
        return balance > 0;
      }
      
      return true;
    });
    
    // Format response
    const formattedCustomers = filteredCustomers.map(customer => {
      // Get the first matching city address or default address
      const defaultAddress = customer.addresses && customer.addresses.length > 0 
        ? customer.addresses.find(addr => addr.isDefault) || customer.addresses[0]
        : null;
      
      return {
        _id: customer._id,
        accountName: customer.businessName || customer.name,
        name: customer.name,
        businessName: customer.businessName,
        city: defaultAddress?.city || '',
        balance: customer.pendingBalance || 0,
        currentBalance: customer.currentBalance || 0,
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0
      };
    });
    
    res.json({
      success: true,
      data: formattedCustomers,
      count: formattedCustomers.length
    });
  } catch (error) {
    console.error('Get customers by cities error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer
// @access  Private
router.get('/:id', [auth, validateCustomerIdParam], async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    res.json({ customer: transformCustomerToUppercase(customer) });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// @route   GET /api/customers/search/:query
// @desc    Search customers by name, email, or phone
// @access  Private
router.get('/search/:query', auth, async (req, res) => {
  try {
    const query = req.params.query;
    
    const customers = await Customer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { businessName: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } }
      ],
      status: 'active'
    })
    .select('name email businessName businessType customerTier phone pendingBalance advanceBalance creditLimit currentBalance')
    .limit(10)
    .lean();
    
    // Add displayName to each customer and transform to uppercase
    const customersWithDisplayName = customers.map(customer => {
      const transformed = transformCustomerToUppercase(customer);
      return {
        ...transformed,
        displayName: (transformed.businessName || transformed.name || '').toUpperCase()
      };
    });
    
    res.json({ customers: customersWithDisplayName });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/customers/check-email/:email
// @desc    Check if email already exists
// @access  Private
router.get('/check-email/:email', auth, async (req, res) => {
  try {
    const email = req.params.email;
    const excludeId = req.query.excludeId; // Optional: exclude current customer when editing
    
    if (!email || email.trim() === '') {
      return res.json({ exists: false });
    }
    
    // Use case-insensitive search to match how emails are stored (lowercase)
    const emailLower = email.trim().toLowerCase();
    const query = { email: emailLower };
    if (excludeId && isValidObjectId(excludeId)) {
      query._id = { $ne: excludeId };
    }
    
    const existingCustomer = await Customer.findOne(query);
    
    res.json({ 
      exists: !!existingCustomer,
      email: emailLower
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/customers/check-business-name/:businessName
// @desc    Check if business name already exists
// @access  Private
router.get('/check-business-name/:businessName', auth, async (req, res) => {
  try {
    const businessName = req.params.businessName;
    const excludeId = req.query.excludeId; // Optional: exclude current customer when editing
    
    if (!businessName || businessName.trim() === '') {
      return res.json({ exists: false });
    }
    
    // Use case-insensitive search (business names are stored in uppercase via transform)
    const businessNameTrimmed = businessName.trim();
    const query = { businessName: { $regex: new RegExp(`^${businessNameTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } };
    if (excludeId && isValidObjectId(excludeId)) {
      query._id = { $ne: excludeId };
    }
    
    const existingCustomer = await Customer.findOne(query);
    
    res.json({ 
      exists: !!existingCustomer,
      businessName: businessNameTrimmed
    });
  } catch (error) {
    console.error('Check business name error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/customers/:id/address
// @desc    Add address to customer
// @access  Private
router.post('/:id/address', [
  auth,
  validateCustomerIdParam,
  requirePermission('edit_customers'),
  body('type').isIn(['billing', 'shipping', 'both']).withMessage('Invalid address type'),
  body('street').trim().isLength({ min: 1 }).withMessage('Street is required'),
  body('city').trim().isLength({ min: 1 }).withMessage('City is required'),
  body('state').trim().isLength({ min: 1 }).withMessage('State is required'),
  body('zipCode').trim().isLength({ min: 1 }).withMessage('Zip code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    // If this is set as default, unset other defaults of the same type
    if (req.body.isDefault) {
      customer.addresses.forEach(addr => {
        if (addr.type === req.body.type || addr.type === 'both') {
          addr.isDefault = false;
        }
      });
    }
    
    customer.addresses.push(req.body);
    await customer.save();
    
    res.json({
      message: 'Address added successfully',
      customer
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/customers/:id/credit-limit
// @desc    Update customer credit limit
// @access  Private
router.put('/:id/credit-limit', [
  auth,
  validateCustomerIdParam,
  requirePermission('edit_customers'),
  body('creditLimit').isFloat({ min: 0 }).withMessage('Credit limit must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { 
        creditLimit: req.body.creditLimit,
        lastModifiedBy: req.user._id
      },
      { new: true, runValidators: true }
    );
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    res.json({
      message: 'Credit limit updated successfully',
      customer
    });
  } catch (error) {
    console.error('Update credit limit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/customers
// @desc    Create a new customer
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_customers'),
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('businessName').trim().isLength({ min: 1 }).withMessage('Business name is required'),
  body('businessType').optional().isIn(['retail', 'wholesale', 'distributor', 'individual']),
  body('customerTier').optional().isIn(['bronze', 'silver', 'gold', 'platinum']),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be a positive number'),
  body('openingBalance').optional().isFloat().withMessage('Opening balance must be a valid number'),
  body('status').optional().isIn(['active', 'inactive', 'suspended'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const openingBalance = parseOpeningBalance(req.body.openingBalance);

    const customerData = {
      ...req.body,
      createdBy: req.user._id
    };

    const customerId = await runWithOptionalTransaction(async (session) => {
      let newCustomer = new Customer(customerData);
      applyOpeningBalance(newCustomer, openingBalance);
      await newCustomer.save(session ? { session } : undefined);

      await ledgerAccountService.syncCustomerLedgerAccount(newCustomer, session ? {
        session,
        userId: req.user._id
      } : {
        userId: req.user._id
      });

      return newCustomer._id;
    }, 'create customer');

    const customer = await Customer.findById(customerId).populate('ledgerAccount', 'accountCode accountName');

    if (!customer) {
      console.error('Create customer error: Newly created customer not found after transaction', { customerId });
      return res.status(500).json({ message: 'Server error' });
    }

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    console.error('Create customer error:', error);
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.businessName) {
        return res.status(400).json({ message: 'Business name already exists' });
      }
      if (error.keyPattern && error.keyPattern.email) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      return res.status(400).json({ message: 'Duplicate field value' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/customers/:id
// @desc    Update a customer
// @access  Private
router.put('/:id', [
  auth,
  validateCustomerIdParam,
  requirePermission('edit_customers'),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('businessName').optional().trim().isLength({ min: 1 }).withMessage('Business name cannot be empty'),
  body('businessType').optional().isIn(['retail', 'wholesale', 'distributor', 'individual']),
  body('customerTier').optional().isIn(['bronze', 'silver', 'gold', 'platinum']),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be a positive number'),
  body('openingBalance').optional().isFloat().withMessage('Opening balance must be a valid number'),
  body('status').optional().isIn(['active', 'inactive', 'suspended'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updatedCustomerId = await runWithOptionalTransaction(async (session) => {
      const customerQuery = session ? Customer.findById(req.params.id).session(session) : Customer.findById(req.params.id);
      const customer = await customerQuery;

      if (!customer) {
        return null;
      }

      const openingBalance = parseOpeningBalance(req.body.openingBalance);

      Object.assign(customer, {
        ...req.body,
        lastModifiedBy: req.user._id
      });
      applyOpeningBalance(customer, openingBalance);

      await customer.save(session ? { session } : undefined);
      await ledgerAccountService.syncCustomerLedgerAccount(customer, session ? {
        session,
        userId: req.user._id
      } : {
        userId: req.user._id
      });

      return customer._id;
    }, 'update customer');

    if (!updatedCustomerId) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const updatedCustomer = await Customer.findById(updatedCustomerId).populate('ledgerAccount', 'accountCode accountName');

    if (!updatedCustomer) {
      console.error('Update customer error: Customer not found after save', { updatedCustomerId });
      return res.status(500).json({ message: 'Server error' });
    }

    res.json({
      message: 'Customer updated successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.businessName) {
        return res.status(400).json({ message: 'Business name already exists' });
      }
      if (error.keyPattern && error.keyPattern.email) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      return res.status(400).json({ message: 'Duplicate field value' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete a customer
// @access  Private
router.delete('/:id', [
  auth,
  validateCustomerIdParam,
  requirePermission('delete_customers')
], async (req, res) => {
  try {
    const deletionResult = await runWithOptionalTransaction(async (session) => {
      const customerQuery = session ? Customer.findById(req.params.id).session(session) : Customer.findById(req.params.id);
      const customer = await customerQuery;

      if (!customer) {
        return null;
      }

      if (customer.ledgerAccount) {
        await ledgerAccountService.deactivateLedgerAccount(customer.ledgerAccount, session ? {
          session,
          userId: req.user?._id
        } : { userId: req.user?._id });
      }

      if (session) {
        await customer.deleteOne({ session });
      } else {
        await customer.deleteOne();
      }

      return true;
    }, 'delete customer');

    if (!deletionResult) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/customers/:id/balance
// @desc    Manually update customer balance (temporary fix endpoint)
// @access  Private
router.put('/:id/balance', [
  auth,
  validateCustomerIdParam,
  requirePermission('edit_customers'),
  body('pendingBalance').optional().isFloat({ min: 0 }).withMessage('Pending balance must be a positive number'),
  body('currentBalance').optional().isFloat().withMessage('Current balance must be a number'),
  body('advanceBalance').optional().isFloat({ min: 0 }).withMessage('Advance balance must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pendingBalance, currentBalance, advanceBalance } = req.body;
    const updateData = {};

    if (pendingBalance !== undefined) updateData.pendingBalance = pendingBalance;
    if (currentBalance !== undefined) updateData.currentBalance = currentBalance;
    if (advanceBalance !== undefined) updateData.advanceBalance = advanceBalance;

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({
      message: 'Customer balance updated successfully',
      customer: {
        id: customer._id,
        name: customer.name,
        businessName: customer.businessName,
        pendingBalance: customer.pendingBalance,
        currentBalance: customer.currentBalance,
        advanceBalance: customer.advanceBalance
      }
    });
  } catch (error) {
    console.error('Update customer balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/customers/import/excel
// @desc    Import customers from Excel
// @access  Private
router.post('/import/excel', [
  auth,
  requirePermission('create_customers'),
  upload.single('file')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const results = {
      total: 0,
      success: 0,
      errors: []
    };
    
    // Read Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const customers = XLSX.utils.sheet_to_json(worksheet);
    
    results.total = customers.length;
    
    for (let i = 0; i < customers.length; i++) {
      try {
        const row = customers[i];
        
        // Map Excel columns to our format
        const customerData = {
          name: row['Name'] || row['name'] || row.name,
          email: row['Email'] || row['email'] || row.email || undefined,
          phone: row['Phone'] || row['phone'] || row.phone || '',
          businessName: row['Business Name'] || row['businessName'] || row.businessName,
          businessType: row['Business Type'] || row['businessType'] || row.businessType || 'wholesale',
          taxId: row['Tax ID'] || row['taxId'] || row.taxId || '',
          customerTier: row['Customer Tier'] || row['customerTier'] || row.customerTier || 'bronze',
          creditLimit: row['Credit Limit'] || row['creditLimit'] || row.creditLimit || 0,
          paymentTerms: row['Payment Terms'] || row['paymentTerms'] || row.paymentTerms || 'cash',
          status: row['Status'] || row['status'] || row.status || 'active',
          notes: row['Notes'] || row['notes'] || row.notes || ''
        };
        
        // Validate required fields
        if (!customerData.name) {
          results.errors.push({
            row: i + 2,
            error: 'Missing required field: Name is required'
          });
          continue;
        }
        
        if (!customerData.businessName) {
          results.errors.push({
            row: i + 2,
            error: 'Missing required field: Business Name is required'
          });
          continue;
        }
        
        // Check if customer already exists
        const existingCustomer = await Customer.findOne({ 
          businessName: customerData.businessName.toString().trim()
        });
        
        if (existingCustomer) {
          results.errors.push({
            row: i + 2,
            error: `Customer already exists with business name: ${customerData.businessName}`
          });
          continue;
        }
        
        // Create customer
        const customer = new Customer({
          name: customerData.name.toString().trim(),
          email: customerData.email ? customerData.email.toString().trim() : undefined,
          phone: customerData.phone.toString().trim() || '',
          businessName: customerData.businessName.toString().trim(),
          businessType: customerData.businessType.toString().toLowerCase(),
          taxId: customerData.taxId.toString().trim() || '',
          customerTier: customerData.customerTier.toString().toLowerCase(),
          creditLimit: parseFloat(customerData.creditLimit) || 0,
          paymentTerms: customerData.paymentTerms.toString().toLowerCase(),
          status: customerData.status.toString().toLowerCase(),
          notes: customerData.notes.toString().trim() || '',
          createdBy: req.user._id
        });
        
        await customer.save();
        results.success++;
        
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error: error.message
        });
      }
    }
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'Import completed',
      results: results
    });
    
  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ message: 'Import failed' });
  }
});

// @route   POST /api/customers/export/excel
// @desc    Export customers to Excel
// @access  Private
router.post('/export/excel', [auth, requirePermission('view_customers')], async (req, res) => {
  try {
    const { filters = {} } = req.body;
    
    // Build query based on filters
    const query = {};
    if (filters.businessType) query.businessType = filters.businessType;
    if (filters.status) query.status = filters.status;
    if (filters.customerTier) query.customerTier = filters.customerTier;
    
    const customers = await Customer.find(query).lean();
    
    // Prepare Excel data
    const excelData = customers.map(customer => ({
      'Name': customer.name,
      'Email': customer.email || '',
      'Phone': customer.phone || '',
      'Business Name': customer.businessName,
      'Business Type': customer.businessType || '',
      'Tax ID': customer.taxId || '',
      'Customer Tier': customer.customerTier || '',
      'Credit Limit': customer.creditLimit || 0,
      'Current Balance': customer.currentBalance || 0,
      'Payment Terms': customer.paymentTerms || '',
      'Status': customer.status || 'active',
      'Notes': customer.notes || '',
      'Created Date': customer.createdAt?.toISOString().split('T')[0] || ''
    }));
    
    // Create Excel workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Name
      { wch: 25 }, // Email
      { wch: 15 }, // Phone
      { wch: 25 }, // Business Name
      { wch: 15 }, // Business Type
      { wch: 15 }, // Tax ID
      { wch: 15 }, // Customer Tier
      { wch: 12 }, // Credit Limit
      { wch: 15 }, // Current Balance
      { wch: 15 }, // Payment Terms
      { wch: 10 }, // Status
      { wch: 30 }, // Notes
      { wch: 12 }  // Created Date
    ];
    worksheet['!cols'] = columnWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    
    // Ensure exports directory exists
    if (!fs.existsSync('exports')) {
      fs.mkdirSync('exports');
    }
    
    const filename = 'customers.xlsx';
    const filepath = path.join('exports', filename);
    XLSX.writeFile(workbook, filepath);
    
    res.json({
      message: 'Customers exported successfully',
      filename: filename,
      recordCount: excelData.length,
      downloadUrl: `/api/customers/download/${filename}`
    });
    
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
});

// @route   GET /api/customers/download/:filename
// @desc    Download exported file
// @access  Private
router.get('/download/:filename', [auth, requirePermission('view_customers')], (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join('exports', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ message: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Download failed' });
  }
});

// @route   GET /api/customers/template/excel
// @desc    Download Excel template
// @access  Private
router.get('/template/excel', [auth, requirePermission('create_customers')], (req, res) => {
  try {
    const templateData = [
      {
        'Name': 'John Doe',
        'Email': 'john@example.com',
        'Phone': '555-0123',
        'Business Name': 'Example Business Inc',
        'Business Type': 'wholesale',
        'Tax ID': '12-3456789',
        'Customer Tier': 'bronze',
        'Credit Limit': '5000',
        'Payment Terms': 'net30',
        'Status': 'active',
        'Notes': 'Sample customer for template'
      }
    ];
    
    // Create Excel workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Name
      { wch: 25 }, // Email
      { wch: 15 }, // Phone
      { wch: 25 }, // Business Name
      { wch: 15 }, // Business Type
      { wch: 15 }, // Tax ID
      { wch: 15 }, // Customer Tier
      { wch: 12 }, // Credit Limit
      { wch: 15 }, // Payment Terms
      { wch: 10 }, // Status
      { wch: 30 }  // Notes
    ];
    worksheet['!cols'] = columnWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    
    // Ensure exports directory exists
    if (!fs.existsSync('exports')) {
      fs.mkdirSync('exports');
    }
    
    const filename = 'customer_template.xlsx';
    const filepath = path.join('exports', filename);
    XLSX.writeFile(workbook, filepath);
    
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ message: 'Failed to download template' });
      }
    });
    
  } catch (error) {
    console.error('Template error:', error);
    res.status(500).json({ message: 'Failed to generate template' });
  }
});

module.exports = router;
