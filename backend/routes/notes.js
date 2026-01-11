const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { body, validationResult, query } = require('express-validator');
const noteService = require('../services/noteService');
const logger = require('../utils/logger');

// @route   GET /api/notes
// @desc    Get notes for an entity
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
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

    const { notes, pagination } = await noteService.getNotes(req.query, req.user.id);
    
    res.json({
      notes,
      pagination
    });
  } catch (error) {
    logger.error('Get notes error:', { error: error });
    res.status(500).json({ message: 'Failed to fetch notes', error: error.message });
  }
});

// @route   GET /api/notes/:id
// @desc    Get a single note with history
// @access  Private
router.get('/:id', [auth, tenantMiddleware], async (req, res) => {
  try {
    const note = await noteService.getNoteById(req.params.id, req.user.id);
    res.json(note);
  } catch (error) {
    if (error.message === 'Note not found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Access denied to private note') {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Get note error:', { error: error });
    res.status(500).json({ message: 'Failed to fetch note', error: error.message });
  }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
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

    const note = await noteService.createNote(req.body, req.user.id);
    
    res.status(201).json(note);
  } catch (error) {
    logger.error('Create note error:', { error: error });
    res.status(500).json({ message: 'Failed to create note', error: error.message });
  }
});

// @route   PUT /api/notes/:id
// @desc    Update a note
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
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

    const note = await noteService.updateNote(req.params.id, req.body, req.user.id);
    
    res.json(note);
  } catch (error) {
    if (error.message === 'Note not found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Only the note creator can edit this note') {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Update note error:', { error: error });
    res.status(500).json({ message: 'Failed to update note', error: error.message });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note (soft delete)
// @access  Private
router.delete('/:id', [auth, tenantMiddleware], async (req, res) => {
  try {
    const result = await noteService.deleteNote(req.params.id, req.user.id);
    
    res.json(result);
  } catch (error) {
    if (error.message === 'Note not found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Only the note creator can delete this note') {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Delete note error:', { error: error });
    res.status(500).json({ message: 'Failed to delete note', error: error.message });
  }
});

// @route   GET /api/notes/:id/history
// @desc    Get note history
// @access  Private
router.get('/:id/history', [auth, tenantMiddleware], async (req, res) => {
  try {
    const history = await noteService.getNoteHistory(req.params.id, req.user.id);
    res.json(history);
  } catch (error) {
    if (error.message === 'Note not found') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Access denied') {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Get note history error:', { error: error });
    res.status(500).json({ message: 'Failed to fetch note history', error: error.message });
  }
});

// @route   GET /api/notes/search/users
// @desc    Search users for @mentions
// @access  Private
router.get('/search/users', [auth, tenantMiddleware], async (req, res) => {
  try {
    const users = await noteService.searchUsers(req.query.q);
    res.json(users);
  } catch (error) {
    logger.error('Search users error:', { error: error });
    res.status(500).json({ message: 'Failed to search users', error: error.message });
  }
});

module.exports = router;

