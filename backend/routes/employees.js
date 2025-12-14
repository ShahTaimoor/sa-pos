const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const Employee = require('../models/Employee');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/employees
// @desc    Get all employees with filters
// @access  Private (requires 'manage_users' or 'view_team_attendance' permission)
router.get('/', [
  auth,
  requirePermission('manage_users'),
  sanitizeRequest,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive', 'terminated', 'on_leave']),
  query('department').optional().isString(),
  query('position').optional().isString(),
], async (req, res) => {
  try {
    const errors = handleValidationErrors(req);
    if (errors) return res.status(400).json({ errors });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { employeeId: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { position: searchRegex },
        { department: searchRegex }
      ];
    }

    // Status filter
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Department filter
    if (req.query.department) {
      query.department = req.query.department;
    }

    // Position filter
    if (req.query.position) {
      query.position = req.query.position;
    }

    const [employees, total] = await Promise.all([
      Employee.find(query)
        .populate('userAccount', 'firstName lastName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Employee.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        employees,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/employees/:id
// @desc    Get single employee
// @access  Private
router.get('/:id', [
  auth,
  requirePermission('manage_users'),
  param('id').isMongoId().withMessage('Invalid employee ID')
], async (req, res) => {
  try {
    const errors = handleValidationErrors(req);
    if (errors) return res.status(400).json({ errors });

    const employee = await Employee.findById(req.params.id)
      .populate('userAccount', 'firstName lastName email role status');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      success: true,
      data: { employee }
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Admin/Manager only)
router.post('/', [
  auth,
  requirePermission('manage_users'),
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
], async (req, res) => {
  try {
    const errors = handleValidationErrors(req);
    if (errors) return res.status(400).json({ errors });

    // Check if employee ID already exists
    if (req.body.employeeId) {
      const existing = await Employee.findOne({ employeeId: req.body.employeeId.toUpperCase() });
      if (existing) {
        return res.status(400).json({ message: 'Employee ID already exists' });
      }
    }

    // Check if email already exists
    if (req.body.email) {
      const existing = await Employee.findOne({ email: req.body.email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Validate user account if provided
    if (req.body.userAccount) {
      const user = await User.findById(req.body.userAccount);
      if (!user) {
        return res.status(400).json({ message: 'User account not found' });
      }
      // Check if user is already linked to another employee
      const existingEmployee = await Employee.findOne({ userAccount: req.body.userAccount });
      if (existingEmployee) {
        return res.status(400).json({ message: 'User account is already linked to another employee' });
      }
    }

    const employee = await Employee.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { employee }
    });
  } catch (error) {
    console.error('Create employee error:', error);
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
  requirePermission('manage_users'),
  param('id').isMongoId().withMessage('Invalid employee ID'),
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('employeeId').optional().trim().isString(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isString(),
  body('position').optional().trim().isLength({ min: 1 }),
  body('status').optional().isIn(['active', 'inactive', 'terminated', 'on_leave']),
  body('userAccount').optional().isMongoId(),
], async (req, res) => {
  try {
    const errors = handleValidationErrors(req);
    if (errors) return res.status(400).json({ errors });

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee ID is being changed and if it's already taken
    if (req.body.employeeId && req.body.employeeId !== employee.employeeId) {
      const existing = await Employee.findOne({ employeeId: req.body.employeeId.toUpperCase() });
      if (existing) {
        return res.status(400).json({ message: 'Employee ID already exists' });
      }
    }

    // Check if email is being changed and if it's already taken
    if (req.body.email && req.body.email !== employee.email) {
      const existing = await Employee.findOne({ email: req.body.email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Validate user account if being changed
    if (req.body.userAccount !== undefined) {
      if (req.body.userAccount && req.body.userAccount !== employee.userAccount?.toString()) {
        const user = await User.findById(req.body.userAccount);
        if (!user) {
          return res.status(400).json({ message: 'User account not found' });
        }
        // Check if user is already linked to another employee
        const existingEmployee = await Employee.findOne({ 
          userAccount: req.body.userAccount,
          _id: { $ne: req.params.id }
        });
        if (existingEmployee) {
          return res.status(400).json({ message: 'User account is already linked to another employee' });
        }
      }
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('userAccount', 'firstName lastName email role');

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee: updatedEmployee }
    });
  } catch (error) {
    console.error('Update employee error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private
router.delete('/:id', [
  auth,
  requirePermission('manage_users'),
  param('id').isMongoId().withMessage('Invalid employee ID')
], async (req, res) => {
  try {
    const errors = handleValidationErrors(req);
    if (errors) return res.status(400).json({ errors });

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee has attendance records
    const Attendance = require('../models/Attendance');
    const attendanceCount = await Attendance.countDocuments({ employee: req.params.id });
    
    if (attendanceCount > 0) {
      // Don't delete, just mark as terminated
      employee.status = 'terminated';
      employee.terminationDate = new Date();
      await employee.save();
      
      return res.json({
        success: true,
        message: 'Employee marked as terminated (has attendance records)',
        data: { employee }
      });
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/employees/departments/list
// @desc    Get list of all departments
// @access  Private
router.get('/departments/list', auth, async (req, res) => {
  try {
    const departments = await Employee.distinct('department', { department: { $ne: null, $ne: '' } });
    res.json({
      success: true,
      data: { departments: departments.sort() }
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/employees/positions/list
// @desc    Get list of all positions
// @access  Private
router.get('/positions/list', auth, async (req, res) => {
  try {
    const positions = await Employee.distinct('position', { position: { $ne: null, $ne: '' } });
    res.json({
      success: true,
      data: { positions: positions.sort() }
    });
  } catch (error) {
    console.error('Get positions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

