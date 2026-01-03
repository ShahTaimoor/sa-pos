const express = require('express');
const { body, query } = require('express-validator');
const { auth, requireAnyPermission } = require('../middleware/auth');
const Attendance = require('../models/Attendance'); // Still needed for new Attendance() and static methods
const Employee = require('../models/Employee'); // Still needed for model reference
const attendanceRepository = require('../repositories/AttendanceRepository');
const employeeRepository = require('../repositories/EmployeeRepository');

const router = express.Router();

// Clock in
router.post('/clock-in', [
  auth,
  requireAnyPermission(['clock_attendance', 'clock_in']),
  body('storeId').optional().isString(),
  body('deviceId').optional().isString(),
  body('notesIn').optional().isString(),
  body('employeeId').optional().isMongoId(), // For managers clocking in other employees
], async (req, res) => {
  try {
    let employee;
    
    // If employeeId is provided (manager clocking in someone else)
    if (req.body.employeeId) {
      employee = await employeeRepository.findById(req.body.employeeId);
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }
      if (employee.status !== 'active') {
        return res.status(400).json({ message: 'Employee is not active' });
      }
    } else {
      // Find employee linked to current user
      employee = await employeeRepository.findByUserAccount(req.user._id);
      if (!employee) {
        return res.status(400).json({ 
          message: 'No employee record found. Please contact administrator to link your user account to an employee record.' 
        });
      }
      if (employee.status !== 'active') {
        return res.status(400).json({ message: 'Your employee account is not active' });
      }
    }
    
    // Check for open session
    const open = await attendanceRepository.findOpenSession(employee._id);
    if (open) {
      return res.status(400).json({ message: 'Employee is already clocked in' });
    }
    
    let session;
    try {
      session = await attendanceRepository.create({
        employee: employee._id,
        user: req.body.employeeId ? null : req.user._id, // Only set if self clock-in
        clockedInBy: req.body.employeeId ? req.user._id : null, // Set if manager clocking in
        storeId: req.body.storeId || null,
        deviceId: req.body.deviceId || null,
        clockInAt: new Date(),
        notesIn: req.body.notesIn || '',
        status: 'open'
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate entry detected'
        });
      }
      throw err;
    }
    
    await session.populate('employee', 'firstName lastName employeeId');
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('Clock in error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Clock out
router.post('/clock-out', [
  auth,
  requireAnyPermission(['clock_attendance', 'clock_out']),
  body('notesOut').optional().isString(),
  body('employeeId').optional().isMongoId(), // For managers clocking out other employees
], async (req, res) => {
  try {
    let employee;
    
    if (req.body.employeeId) {
      employee = await employeeRepository.findById(req.body.employeeId);
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }
    } else {
      employee = await employeeRepository.findByUserAccount(req.user._id);
      if (!employee) {
        return res.status(400).json({ message: 'No employee record found' });
      }
    }
    
    const session = await attendanceRepository.findOpenSession(employee._id);
    if (!session) {
      return res.status(400).json({ message: 'Employee is not clocked in' });
    }
    session.closeSession(req.body.notesOut);
    await session.save();
    await session.populate('employee', 'firstName lastName employeeId');
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('Clock out error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start break
router.post('/breaks/start', [
  auth,
  requireAnyPermission(['manage_attendance_breaks', 'clock_attendance']),
  body('type').optional().isIn(['break', 'lunch', 'other'])
], async (req, res) => {
  try {
    const employee = await employeeRepository.findByUserAccount(req.user._id);
    if (!employee) {
      return res.status(400).json({ message: 'No employee record found' });
    }
    
    const session = await attendanceRepository.findOpenSession(employee._id);
    if (!session) {
      return res.status(400).json({ message: 'You are not clocked in' });
    }
    const ok = session.startBreak(req.body.type || 'break');
    if (!ok) {
      return res.status(400).json({ message: 'Active break already in progress or session closed' });
    }
    await session.save();
    await session.populate('employee', 'firstName lastName employeeId');
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('Start break error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// End break
router.post('/breaks/end', [
  auth,
  requireAnyPermission(['manage_attendance_breaks', 'clock_attendance']),
], async (req, res) => {
  try {
    const employee = await employeeRepository.findByUserAccount(req.user._id);
    if (!employee) {
      return res.status(400).json({ message: 'No employee record found' });
    }
    
    const session = await attendanceRepository.findOpenSession(employee._id);
    if (!session) {
      return res.status(400).json({ message: 'You are not clocked in' });
    }
    const ok = session.endBreak();
    if (!ok) {
      return res.status(400).json({ message: 'No active break to end' });
    }
    await session.save();
    await session.populate('employee', 'firstName lastName employeeId');
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('End break error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get current status
router.get('/status', [
  auth,
  requireAnyPermission(['view_own_attendance', 'clock_attendance']),
], async (req, res) => {
  try {
    const employee = await employeeRepository.findByUserAccount(req.user._id);
    if (!employee) {
      return res.json({ success: true, data: null }); // No employee record, no attendance
    }
    
    const session = await attendanceRepository.findOpenSession(employee._id, {
      populate: [
        { path: 'employee', select: 'firstName lastName employeeId position department' },
        { path: 'user', select: 'firstName lastName email' }
      ]
    });
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('Get status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// My attendance list
router.get('/me', [
  auth,
  requireAnyPermission(['view_own_attendance', 'clock_attendance']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
], async (req, res) => {
  try {
    const employee = await employeeRepository.findByUserAccount(req.user._id);
    if (!employee) {
      return res.json({ success: true, data: [] }); // No employee record, no attendance
    }
    
    const limit = parseInt(req.query.limit || '30');
    const query = { employee: employee._id };
    
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }
    
    const result = await attendanceRepository.findWithPagination(query, {
      page: 1,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'employee', select: 'firstName lastName employeeId position department' },
        { path: 'user', select: 'firstName lastName email' }
      ]
    });
    const rows = result.attendances;
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get my attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Team attendance (for managers)
router.get('/team', [
  auth,
  requireAnyPermission(['view_team_attendance']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('employeeId').optional().isMongoId(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('status').optional().isIn(['open', 'closed']),
], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const query = {};
    
    if (req.query.employeeId) {
      query.employee = req.query.employeeId;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }
    
    const result = await attendanceRepository.findWithPagination(query, {
      page: 1,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'employee', select: 'firstName lastName employeeId position department' },
        { path: 'user', select: 'firstName lastName email role' },
        { path: 'clockedInBy', select: 'firstName lastName email' }
      ]
    });
    const rows = result.attendances;
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get team attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


