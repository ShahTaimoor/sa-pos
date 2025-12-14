const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const User = require('../models/User');
const { auth, requirePermission } = require('../middleware/auth');
const { body, validationResult, query } = require('express-validator');

// @route   GET /api/notes
// @desc    Get notes for an entity
// @access  Private
router.get('/', [
  auth,
  query('entityType').isIn(['Customer', 'Product', 'SalesOrder', 'PurchaseOrder', 'Supplier', 'Sale', 'PurchaseInvoice', 'SalesInvoice']).optional(),
  query('entityId').isMongoId().optional(),
  query('isPrivate').isBoolean().optional(),
  query('search').isString().optional(),
  query('tags').isString().optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId, isPrivate, search, tags, limit = 50, page = 1 } = req.query;
    const userId = req.user.id;
    
    // Build query
    const query = { status: 'active' };
    
    if (entityType && entityId) {
      query.entityType = entityType;
      query.entityId = entityId;
    }
    
    // Privacy filter: show public notes or private notes created by current user
    if (isPrivate !== undefined) {
      query.isPrivate = isPrivate === 'true';
    } else {
      // Default: show all notes user has access to
      query.$or = [
        { isPrivate: false },
        { isPrivate: true, createdBy: userId }
      ];
    }
    
    // Search filter
    if (search) {
      query.$text = { $search: search };
    }
    
    // Tags filter
    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const notes = await Note.find(query)
      .populate('createdBy', 'name username email')
      .populate('mentions.userId', 'name username email')
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    const total = await Note.countDocuments(query);
    
    res.json({
      notes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Failed to fetch notes', error: error.message });
  }
});

// @route   GET /api/notes/:id
// @desc    Get a single note with history
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('createdBy', 'name username email')
      .populate('mentions.userId', 'name username email')
      .populate('history.editedBy', 'name username email');
    
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Check access: private notes only visible to creator
    if (note.isPrivate && note.createdBy._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to private note' });
    }
    
    res.json(note);
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ message: 'Failed to fetch note', error: error.message });
  }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private
router.post('/', [
  auth,
  body('entityType').isIn(['Customer', 'Product', 'SalesOrder', 'PurchaseOrder', 'Supplier', 'Sale', 'PurchaseInvoice', 'SalesInvoice']),
  body('entityId').isMongoId(),
  body('content').trim().isLength({ min: 1, max: 10000 }),
  body('htmlContent').optional().isString(),
  body('isPrivate').optional().isBoolean(),
  body('tags').optional().isArray(),
  body('isPinned').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId, content, htmlContent, isPrivate, tags, isPinned } = req.body;
    
    // Create note
    const note = new Note({
      entityType,
      entityId,
      content,
      htmlContent: htmlContent || content,
      isPrivate: isPrivate || false,
      tags: tags || [],
      isPinned: isPinned || false,
      createdBy: req.user.id
    });
    
    // Extract mentions
    const users = await User.find({}).select('name username email');
    note.extractMentions(users);
    
    await note.save();
    
    // Populate before returning
    await note.populate('createdBy', 'name username email');
    await note.populate('mentions.userId', 'name username email');
    
    res.status(201).json(note);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ message: 'Failed to create note', error: error.message });
  }
});

// @route   PUT /api/notes/:id
// @desc    Update a note
// @access  Private
router.put('/:id', [
  auth,
  body('content').optional().trim().isLength({ min: 1, max: 10000 }),
  body('htmlContent').optional().isString(),
  body('isPrivate').optional().isBoolean(),
  body('tags').optional().isArray(),
  body('isPinned').optional().isBoolean(),
  body('changeReason').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Check permissions: only creator can edit
    if (note.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the note creator can edit this note' });
    }
    
    // Add to history before updating
    note.addHistoryEntry(req.user.id, req.body.changeReason);
    
    // Update fields
    if (req.body.content !== undefined) note.content = req.body.content;
    if (req.body.htmlContent !== undefined) note.htmlContent = req.body.htmlContent;
    if (req.body.isPrivate !== undefined) note.isPrivate = req.body.isPrivate;
    if (req.body.tags !== undefined) note.tags = req.body.tags;
    if (req.body.isPinned !== undefined) note.isPinned = req.body.isPinned;
    
    // Re-extract mentions
    const users = await User.find({}).select('name username email');
    note.extractMentions(users);
    
    await note.save();
    
    // Populate before returning
    await note.populate('createdBy', 'name username email');
    await note.populate('mentions.userId', 'name username email');
    await note.populate('history.editedBy', 'name username email');
    
    res.json(note);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ message: 'Failed to update note', error: error.message });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note (soft delete)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Check permissions: only creator can delete
    if (note.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the note creator can delete this note' });
    }
    
    // Soft delete
    note.status = 'deleted';
    await note.save();
    
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Failed to delete note', error: error.message });
  }
});

// @route   GET /api/notes/:id/history
// @desc    Get note history
// @access  Private
router.get('/:id/history', auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('history.editedBy', 'name username email')
      .select('history');
    
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    
    // Check access
    if (note.isPrivate && note.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(note.history);
  } catch (error) {
    console.error('Get note history error:', error);
    res.status(500).json({ message: 'Failed to fetch note history', error: error.message });
  }
});

// @route   GET /api/notes/search/users
// @desc    Search users for @mentions
// @access  Private
router.get('/search/users', auth, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ],
      role: { $ne: 'deleted' }
    })
    .select('name username email')
    .limit(10)
    .lean();
    
    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Failed to search users', error: error.message });
  }
});

module.exports = router;

