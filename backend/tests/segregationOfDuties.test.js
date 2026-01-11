/**
 * Segregation of Duties Middleware Tests
 * Tests for segregation of duties controls
 */

const { checkSegregationOfDuties } = require('../middleware/segregationOfDuties');

describe('Segregation of Duties Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: {
        _id: 'user123',
        permissions: ['create_journal_vouchers', 'approve_journal_vouchers']
      },
      method: 'POST',
      path: '/api/journal-vouchers/123/approve',
      params: { id: '123' },
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    next = jest.fn();
  });

  it('should allow approval by different user', async () => {
    const JournalVoucher = require('../models/JournalVoucher');
    JournalVoucher.findById = jest.fn().mockResolvedValue({
      _id: '123',
      createdBy: 'user456', // Different user
      approvalWorkflow: { status: 'pending' }
    });

    const middleware = checkSegregationOfDuties('create_journal_vouchers', 'approve_journal_vouchers');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should prevent approval of own work', async () => {
    const JournalVoucher = require('../models/JournalVoucher');
    JournalVoucher.findById = jest.fn().mockResolvedValue({
      _id: '123',
      createdBy: 'user123', // Same user
      approvalWorkflow: { status: 'pending' }
    });

    const middleware = checkSegregationOfDuties('create_journal_vouchers', 'approve_journal_vouchers');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('own work')
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow if user does not have both permissions', async () => {
    req.user.permissions = ['create_journal_vouchers']; // Only create permission

    const middleware = checkSegregationOfDuties('create_journal_vouchers', 'approve_journal_vouchers');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

