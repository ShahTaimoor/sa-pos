const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const employeeService = require('../services/employeeService');
const employeeRepository = require('../repositories/EmployeeRepository');
const Employee = require('../models/Employee');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/employees
// @desc    Get all employees with filters
// @access  Private (requires 'manage_users' or 'view_team_attendance' permission)
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users'),
  sanitizeRequest,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive', 'terminated', 'on_leave']),
  query('department').optional().isString(),
  query('position').optional().isString(),
  handleValidationErrors, // Use as middleware
], async (req, res) => {
  try {
    logger.debug('GET /api/employees - Request received', { query: req.query });

    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Call service to get employees
    const result = await employeeService.getEmployees(req.query, tenantId);
    
    res.json({
      success: true,
      data: {
        employees: result.employees,
        pagination: result.pagination
      }
    });
  } catch (error) {
    logger.error('Get employees error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// @route   GET /api/employees/:id
// @desc    Get single employee
// @access  Private
router.get('/:id', [
  auth,
  tenantMiddleware, // CRITICAL: Enforce tenant isolation
  requirePermission('manage_users'),
  param('id').isMongoId().withMessage('Invalid employee ID'),
  handleValidationErrors, // Use as middleware
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const employee = await employeeService.getEmployeeById(req.params.id, tenantId);

    res.json({
      success: true,
      data: { employee }
    });
  } catch (error) {
    logger.error('Get employee error:', { error: error });
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Admin/Manager only)
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users'),
  sanitizeRequest,
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('employeeId').optional().trim().isString(),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().isString(),
  body('position').trim().isLength({ min: 1 }).withMessage('Position is required'),
  body('department').optional().isString(),
  body('hireDate').optional().isISO8601().withMessage('Valid hire date is required'),
  body('employmentType').optional().isIn(['full_time', 'part_time', 'contract', 'temporary', 'intern']),
  body('status').optional().isIn(['active', 'inactive', 'terminated', 'on_leave']),
  body('userAccount').optional().isMongoId().withMessage('Invalid user account ID'),
  handleValidationErrors, // Use as middleware
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'tenantId is required' });
    }
    
    // Create employee with tenantId
    const employeeData = {
      ...req.body,
      tenantId: tenantId
    };
    
    // Check if employeeId already exists (within tenant)
    if (employeeData.employeeId) {
      const exists = await employeeService.checkEmployeeIdExists(employeeData.employeeId, tenantId);
      if (exists) {
        return res.status(400).json({ message: 'Employee ID already exists' });
      }
    }
    
    // Check if email already exists (within tenant)
    if (employeeData.email) {
      const emailExists = await employeeService.checkEmailExists(employeeData.email, tenantId);
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }
    
    const employee = await employeeService.createEmployee(employeeData, req.user._id, { tenantId });

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { employee }
    });
  } catch (error) {
    logger.error('Create employee error', { error: error.message });
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users'),
  sanitizeRequest,
  param('id').isMongoId().withMessage('Invalid employee ID'),
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('employeeId').optional().trim().isString(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isString(),
  body('position').optional().trim().isLength({ min: 1 }),
  body('status').optional().isIn(['active', 'inactive', 'terminated', 'on_leave']),
  body('userAccount').optional().isMongoId(),
  handleValidationErrors, // Use as middleware
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    // Note: updateEmployee needs to be updated to accept tenantId
    // For now, we'll pass it in the body
    const updateData = {
      ...req.body,
      tenantId: tenantId
    };
    const updatedEmployee = await employeeService.updateEmployee(req.params.id, req.body, tenantId);

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee: updatedEmployee }
    });
  } catch (error) {
    if (error.message === 'Employee not found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already exists') || error.message.includes('not found') || error.message.includes('already linked')) {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Update employee error:', { error: error });
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware, // CRITICAL: Enforce tenant isolation
  requirePermission('manage_users'),
  param('id').isMongoId().withMessage('Invalid employee ID'),
  handleValidationErrors, // Use as middleware
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const result = await employeeService.deleteEmployee(req.params.id, tenantId);

    res.json({
      success: true,
      message: result.message,
      ...(result.employee && { data: { employee: result.employee } })
    });
  } catch (error) {
    if (error.message === 'Employee not found') {
      return res.status(404).json({ message: error.message });
    }
    logger.error('Delete employee error', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/employees/departments/list
// @desc    Get list of all departments
// @access  Private
router.get('/departments/list', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const departments = await Employee.distinct('department', { 
      tenantId: tenantId,
      department: { $ne: null, $ne: '' } 
    });
    res.json({
      success: true,
      data: { departments: departments.sort() }
    });
  } catch (error) {
    logger.error('Get departments error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/employees/positions/list
// @desc    Get list of all positions
// @access  Private
router.get('/positions/list', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const positions = await Employee.distinct('position', { 
      tenantId: tenantId,
      position: { $ne: null, $ne: '' } 
    });
    res.json({
      success: true,
      data: { positions: positions.sort() }
    });
  } catch (error) {
    logger.error('Get positions error', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

