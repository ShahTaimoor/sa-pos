const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// @route   GET /api/settings/company
// @desc    Get company settings
// @access  Private
router.get('/company', auth, async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get company settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company settings',
      error: error.message
    });
  }
});

// @route   PUT /api/settings/company
// @desc    Update company settings
// @access  Private (Admin only)
router.put('/company', auth, async (req, res) => {
  try {
    console.log('📥 Received PUT /api/settings/company request');
    console.log('Request body:', req.body);
    console.log('User:', req.user?.email);
    
    const {
      companyName,
      contactNumber,
      address,
      email,
      website,
      taxId,
      registrationNumber,
      currency,
      dateFormat,
      timeFormat,
      fiscalYearStart,
      defaultTaxRate
    } = req.body;

    // Validation
    if (!companyName || !contactNumber || !address) {
      return res.status(400).json({
        success: false,
        message: 'Company name, contact number, and address are required'
      });
    }

    const updates = {};
    if (companyName) updates.companyName = companyName;
    if (contactNumber) updates.contactNumber = contactNumber;
    if (address) updates.address = address;
    if (email !== undefined) updates.email = email;
    if (website !== undefined) updates.website = website;
    if (taxId !== undefined) updates.taxId = taxId;
    if (registrationNumber !== undefined) updates.registrationNumber = registrationNumber;
    if (currency) updates.currency = currency;
    if (dateFormat) updates.dateFormat = dateFormat;
    if (timeFormat) updates.timeFormat = timeFormat;
    if (fiscalYearStart) updates.fiscalYearStart = fiscalYearStart;
    if (defaultTaxRate !== undefined) updates.defaultTaxRate = defaultTaxRate;

    console.log('📝 Updates to apply:', updates);
    const settings = await Settings.updateSettings(updates);
    console.log('✅ Settings saved successfully:', settings);

    res.json({
      success: true,
      message: 'Company settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Update company settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update company settings',
      error: error.message
    });
  }
});

// @route   GET /api/settings/preferences
// @desc    Get user preferences
// @access  Private
router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.preferences || {}
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user preferences',
      error: error.message
    });
  }
});

// @route   PUT /api/settings/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', auth, async (req, res) => {
  try {
    const { theme, language, timezone } = req.body;

    const updates = {};
    if (theme) updates['preferences.theme'] = theme;
    if (language) updates['preferences.language'] = language;
    if (timezone) updates['preferences.timezone'] = timezone;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('preferences');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User preferences updated successfully',
      data: user.preferences
    });
  } catch (error) {
    console.error('Update user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user preferences',
      error: error.message
    });
  }
});

module.exports = router;

