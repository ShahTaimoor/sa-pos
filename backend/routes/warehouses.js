const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { sanitizeRequest } = require('../middleware/validation');
const Warehouse = require('../models/Warehouse');
const Inventory = require('../models/Inventory');

const router = express.Router();

const validateWarehouseId = [
  param('id')
    .isMongoId()
    .withMessage('Valid warehouse ID is required'),
];

const baseFilters = [
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Search must be a string up to 150 characters'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const createWarehouseValidators = ({ allowPartial = false } = {}) => {
  const chain = [];

  const nameValidator = body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Name must be between 2 and 150 characters');
  chain.push(allowPartial ? nameValidator.optional({ nullable: true }) : nameValidator);

  const codeValidator = body('code')
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Code must be between 2 and 50 characters');
  chain.push(allowPartial ? codeValidator.optional({ nullable: true }) : codeValidator);

  const descriptionValidator = body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 });
  chain.push(descriptionValidator);

  const addressValidator = body('address')
    .optional()
    .isObject()
    .withMessage('Address must be an object');
  chain.push(addressValidator);

  chain.push(body('address.line1').optional().isString().trim().isLength({ max: 150 }));
  chain.push(body('address.line2').optional().isString().trim().isLength({ max: 150 }));
  chain.push(body('address.city').optional().isString().trim().isLength({ max: 100 }));
  chain.push(body('address.state').optional().isString().trim().isLength({ max: 100 }));
  chain.push(
    body('address.postalCode').optional().isString().trim().isLength({ max: 30 })
  );
  chain.push(body('address.country').optional().isString().trim().isLength({ max: 100 }));

  const contactValidator = body('contact')
    .optional()
    .isObject()
    .withMessage('Contact must be an object');
  chain.push(contactValidator);

  chain.push(body('contact.name').optional().isString().trim().isLength({ max: 150 }));
  chain.push(body('contact.phone').optional().isString().trim().isLength({ max: 50 }));
  chain.push(
    body('contact.email')
      .optional()
      .isString()
      .trim()
      .isEmail()
      .withMessage('Contact email must be a valid email')
  );

  chain.push(body('notes').optional().isString().trim().isLength({ max: 1000 }));
  chain.push(
    body('capacity')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Capacity must be a positive number')
  );
  chain.push(body('isPrimary').optional().isBoolean());
  chain.push(body('isActive').optional().isBoolean());

  return chain;
};

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.get(
  '/',
  [
    auth,
    requirePermission('view_inventory'),
    sanitizeRequest,
    ...baseFilters,
    handleValidation,
  ],
  async (req, res) => {
    try {
      const {
        search,
        isActive,
        page = 1,
        limit = 20,
      } = req.query;

      const filters = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true' || isActive === true;
      }

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        filters.$or = [{ name: searchRegex }, { code: searchRegex }];
      }

      const numericLimit = parseInt(limit, 10) || 20;
      const numericPage = parseInt(page, 10) || 1;

      const [items, total] = await Promise.all([
        Warehouse.find(filters)
          .sort({ isPrimary: -1, name: 1 })
          .skip((numericPage - 1) * numericLimit)
          .limit(numericLimit),
        Warehouse.countDocuments(filters),
      ]);

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            total,
            pages: Math.ceil(total / numericLimit),
            current: numericPage,
            limit: numericLimit,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching warehouses',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

router.get(
  '/:id',
  [
    auth,
    requirePermission('view_inventory'),
    sanitizeRequest,
    ...validateWarehouseId,
    handleValidation,
  ],
  async (req, res) => {
    try {
      const warehouse = await Warehouse.findById(req.params.id);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found',
        });
      }

      res.json({
        success: true,
        data: warehouse,
      });
    } catch (error) {
      console.error('Error fetching warehouse:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching warehouse',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

router.post(
  '/',
  [
    auth,
    requirePermission('update_inventory'),
    sanitizeRequest,
    ...createWarehouseValidators(),
    handleValidation,
  ],
  async (req, res) => {
    try {
      const payload = {
        ...req.body,
        code: req.body.code.toUpperCase(),
        createdBy: req.user?._id,
        updatedBy: req.user?._id,
      };

      if (payload.isPrimary) {
        await Warehouse.updateMany({}, { $set: { isPrimary: false } });
      }

      const warehouse = await Warehouse.create(payload);
      res.status(201).json({
        success: true,
        message: 'Warehouse created successfully',
        data: warehouse,
      });
    } catch (error) {
      console.error('Error creating warehouse:', error);
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Warehouse code must be unique',
        });
      }
      res.status(500).json({
        success: false,
        message: 'Server error creating warehouse',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

router.put(
  '/:id',
  [
    auth,
    requirePermission('update_inventory'),
    sanitizeRequest,
    ...validateWarehouseId,
    ...createWarehouseValidators({ allowPartial: true }),
    handleValidation,
  ],
  async (req, res) => {
    try {
      const warehouse = await Warehouse.findById(req.params.id);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found',
        });
      }

      const updates = { ...req.body };

      if (updates.code) {
        updates.code = updates.code.toUpperCase();
      }

      if (updates.isPrimary) {
        await Warehouse.updateMany(
          { _id: { $ne: warehouse._id } },
          { $set: { isPrimary: false } }
        );
      }

      Object.assign(warehouse, updates, { updatedBy: req.user?._id });
      await warehouse.save();

      res.json({
        success: true,
        message: 'Warehouse updated successfully',
        data: warehouse,
      });
    } catch (error) {
      console.error('Error updating warehouse:', error);
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Warehouse code must be unique',
        });
      }
      res.status(500).json({
        success: false,
        message: 'Server error updating warehouse',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

router.delete(
  '/:id',
  [
    auth,
    requirePermission('update_inventory'),
    sanitizeRequest,
    ...validateWarehouseId,
    handleValidation,
  ],
  async (req, res) => {
    try {
      const warehouse = await Warehouse.findById(req.params.id);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found',
        });
      }

      if (warehouse.isPrimary) {
        return res.status(400).json({
          success: false,
          message: 'Primary warehouse cannot be deleted. Transfer primary status before deleting.',
        });
      }

      const usageCount = await Inventory.countDocuments({
        $or: [
          { 'location.warehouse': warehouse.name },
          { 'location.warehouseCode': warehouse.code },
          { warehouseId: warehouse._id },
        ],
      });

      if (usageCount > 0) {
        return res.status(400).json({
          success: false,
          message:
            'Cannot delete warehouse while inventory records are assigned to it. Please reassign or deactivate instead.',
        });
      }

      await Warehouse.deleteOne({ _id: warehouse._id });

      res.json({
        success: true,
        message: 'Warehouse deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting warehouse',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

module.exports = router;

