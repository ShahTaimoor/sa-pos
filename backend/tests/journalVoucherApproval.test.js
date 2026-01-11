/**
 * Journal Voucher Approval Tests
 * Tests for approval workflow and segregation of duties
 */

const JournalVoucher = require('../models/JournalVoucher');

describe('JournalVoucher Approval Workflow', () => {
  describe('requiresApprovalCheck', () => {
    it('should require approval for amounts >= threshold', () => {
      const voucher = new JournalVoucher({
        totalDebit: 15000,
        totalCredit: 15000
      });

      const requiresApproval = voucher.requiresApprovalCheck(10000);
      expect(requiresApproval).toBe(true);
    });

    it('should not require approval for amounts < threshold', () => {
      const voucher = new JournalVoucher({
        totalDebit: 5000,
        totalCredit: 5000
      });

      const requiresApproval = voucher.requiresApprovalCheck(10000);
      expect(requiresApproval).toBe(false);
    });
  });

  describe('canBeApprovedBy', () => {
    it('should prevent user from approving own work', () => {
      const userId = 'user123';
      const voucher = new JournalVoucher({
        createdBy: userId,
        approvalWorkflow: {
          status: 'pending'
        }
      });

      const result = voucher.canBeApprovedBy(userId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('own work');
    });

    it('should allow different user to approve', () => {
      const creatorId = 'user123';
      const approverId = 'user456';
      const voucher = new JournalVoucher({
        createdBy: creatorId,
        approvalWorkflow: {
          status: 'pending',
          approvers: []
        }
      });

      const result = voucher.canBeApprovedBy(approverId);
      expect(result.allowed).toBe(true);
    });

    it('should prevent approval of already approved voucher', () => {
      const voucher = new JournalVoucher({
        approvalWorkflow: {
          status: 'approved'
        }
      });

      const result = voucher.canBeApprovedBy('user456');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('already approved');
    });

    it('should prevent approval of rejected voucher', () => {
      const voucher = new JournalVoucher({
        approvalWorkflow: {
          status: 'rejected'
        }
      });

      const result = voucher.canBeApprovedBy('user456');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rejected');
    });
  });
});

