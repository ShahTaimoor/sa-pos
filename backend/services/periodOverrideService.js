/**
 * Period Override Service
 * 
 * Manages admin overrides for closed/locked periods
 * Provides approval workflow and audit trail
 */

const AccountingPeriod = require('../models/AccountingPeriod');
const PeriodOverride = require('../models/PeriodOverride');
const User = require('../models/User');
const logger = require('../utils/logger');

class PeriodOverrideService {
  /**
   * Get required permission for period status
   * @param {String} status - Period status
   * @returns {String} Required permission
   */
  getRequiredPermission(status) {
    switch (status) {
      case 'closed':
        return 'override_closed_period';
      case 'locked':
        return 'override_locked_period';
      default:
        return 'override_period';
    }
  }

  /**
   * Get approval requirements for period status
   * @param {AccountingPeriod} period - Period
   * @returns {Number} Number of approvals required
   */
  getApprovalRequirements(period) {
    if (period.status === 'closed') {
      return period.isCritical ? 2 : 1;
    }
    
    if (period.status === 'locked') {
      return period.isCritical ? 3 : 2;
    }
    
    return 0;
  }

  /**
   * Request period override
   * @param {String} periodId - Period ID
   * @param {Object} user - User requesting override
   * @param {String} reason - Override reason
   * @param {String} operation - Operation type
   * @param {Object} options - Options
   * @returns {Promise<PeriodOverride>} Override request
   */
  async requestOverride(periodId, user, reason, operation, options = {}) {
    const { documentType = null, documentId = null } = options;
    
    const period = await AccountingPeriod.findById(periodId);
    if (!period) {
      throw new Error('Period not found');
    }
    
    // Check if period is actually locked
    if (!period.isLocked()) {
      throw new Error(`Period ${period.periodName} is not locked. Override not needed.`);
    }
    
    // Check user permissions
    const requiredPermission = this.getRequiredPermission(period.status);
    const userDoc = await User.findById(user._id || user);
    if (!userDoc || !userDoc.hasPermission(requiredPermission)) {
      throw new Error(`Insufficient permissions. Required: ${requiredPermission}`);
    }
    
    // Check for existing active override
    const existingOverride = await PeriodOverride.findOne({
      period: periodId,
      user: userDoc._id,
      operation: operation,
      status: { $in: ['pending_approval', 'approved'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (existingOverride) {
      logger.info(`Existing override found: ${existingOverride._id}`);
      return existingOverride;
    }
    
    // Determine approval requirements
    const approvalRequired = this.getApprovalRequirements(period);
    
    // Create override request
    const override = new PeriodOverride({
      period: periodId,
      user: userDoc._id,
      operation: operation,
      reason: reason,
      documentType: documentType,
      documentId: documentId,
      status: approvalRequired > 0 ? 'pending_approval' : 'approved',
      approvalRequired: approvalRequired
    });
    
    await override.save();
    
    // If no approval required, return immediately
    if (approvalRequired === 0) {
      logger.info(`Override approved immediately: ${override._id}`, {
        periodId,
        userId: userDoc._id,
        operation
      });
      return override;
    }
    
    // Request approvals (notify approvers)
    await this.requestApprovals(override, period);
    
    logger.info(`Override request created: ${override._id}`, {
      periodId,
      userId: userDoc._id,
      operation,
      approvalRequired
    });
    
    return override;
  }

  /**
   * Request approvals for override
   * @param {PeriodOverride} override - Override request
   * @param {AccountingPeriod} period - Period
   */
  async requestApprovals(override, period) {
    // Get users with approval permissions
    const approvers = await User.find({
      role: { $in: ['admin', 'manager', 'accountant'] },
      isActive: true
    }).limit(10); // Get potential approvers
    
    // TODO: Send notifications to approvers
    // await notificationService.notifyApprovers(override, approvers);
    
    logger.info(`Approval requested for override: ${override._id}`, {
      approvalRequired: override.approvalRequired,
      approversCount: approvers.length
    });
  }

  /**
   * Approve override
   * @param {String} overrideId - Override ID
   * @param {Object} approver - User approving
   * @param {String} notes - Approval notes
   * @returns {Promise<PeriodOverride>} Updated override
   */
  async approveOverride(overrideId, approver, notes = '') {
    const override = await PeriodOverride.findById(overrideId)
      .populate('period');
    
    if (!override) {
      throw new Error('Override not found');
    }
    
    if (override.status !== 'pending_approval') {
      throw new Error(`Override is ${override.status}. Cannot approve.`);
    }
    
    const approverDoc = await User.findById(approver._id || approver);
    if (!approverDoc) {
      throw new Error('Approver not found');
    }
    
    // Check if user already approved
    const existingApproval = override.approvals.find(
      a => a.approvedBy.toString() === approverDoc._id.toString()
    );
    
    if (existingApproval) {
      throw new Error('User has already approved this override');
    }
    
    // Check approver permissions
    const requiredPermission = this.getRequiredPermission(override.period.status);
    if (!approverDoc.hasPermission(requiredPermission)) {
      throw new Error(`Insufficient permissions to approve. Required: ${requiredPermission}`);
    }
    
    // Add approval
    override.approvals.push({
      approvedBy: approverDoc._id,
      approvedAt: new Date(),
      notes: notes || `Approved by ${approverDoc.firstName} ${approverDoc.lastName}`
    });
    
    // Check if all approvals received
    if (override.approvals.length >= override.approvalRequired) {
      override.status = 'approved';
      override.approvedAt = new Date();
      
      // Set expiration (24 hours from approval)
      override.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    await override.save();
    
    // Log audit
    logger.info(`Override approved: ${override._id}`, {
      overrideId: override._id,
      approverId: approverDoc._id,
      approvals: override.approvals.length,
      required: override.approvalRequired
    });
    
    return override;
  }

  /**
   * Reject override
   * @param {String} overrideId - Override ID
   * @param {Object} rejector - User rejecting
   * @param {String} reason - Rejection reason
   * @returns {Promise<PeriodOverride>} Updated override
   */
  async rejectOverride(overrideId, rejector, reason) {
    const override = await PeriodOverride.findById(overrideId);
    if (!override) {
      throw new Error('Override not found');
    }
    
    if (override.status !== 'pending_approval') {
      throw new Error(`Override is ${override.status}. Cannot reject.`);
    }
    
    const rejectorDoc = await User.findById(rejector._id || rejector);
    if (!rejectorDoc) {
      throw new Error('Rejector not found');
    }
    
    override.status = 'rejected';
    override.rejectedBy = rejectorDoc._id;
    override.rejectedAt = new Date();
    override.rejectionReason = reason;
    
    await override.save();
    
    logger.info(`Override rejected: ${override._id}`, {
      overrideId: override._id,
      rejectorId: rejectorDoc._id,
      reason
    });
    
    return override;
  }

  /**
   * Use override for operation
   * @param {String} overrideId - Override ID
   * @param {Object} user - User using override
   * @returns {Promise<Object>} Override authorization
   */
  async useOverride(overrideId, user) {
    const override = await PeriodOverride.findById(overrideId)
      .populate('period');
    
    if (!override) {
      throw new Error('Override not found');
    }
    
    // Check if override can be used
    const canUse = override.canBeUsed();
    if (!canUse.canUse) {
      throw new Error(canUse.reason);
    }
    
    const userDoc = await User.findById(user._id || user);
    if (!userDoc) {
      throw new Error('User not found');
    }
    
    // Check if user is the requester
    if (override.user.toString() !== userDoc._id.toString()) {
      throw new Error('Override can only be used by requesting user');
    }
    
    // Mark as used
    override.usedAt = new Date();
    override.usedBy = userDoc._id;
    override.status = 'used';
    await override.save();
    
    // Update period override count
    await AccountingPeriod.findByIdAndUpdate(
      override.period._id,
      {
        $inc: { overrideCount: 1 },
        $set: {
          lastOverrideAt: new Date(),
          lastOverrideBy: userDoc._id
        }
      }
    );
    
    // Log audit
    logger.warn(`Period override used: ${override._id}`, {
      overrideId: override._id,
      periodId: override.period._id,
      periodName: override.period.periodName,
      userId: userDoc._id,
      operation: override.operation,
      reason: override.reason
    });
    
    return {
      authorized: true,
      overrideId: override._id,
      periodId: override.period._id,
      periodName: override.period.periodName,
      reason: override.reason,
      expiresAt: override.expiresAt
    };
  }

  /**
   * Get active overrides for user
   * @param {Object} user - User
   * @returns {Promise<Array>} Active overrides
   */
  async getActiveOverrides(user) {
    const userDoc = await User.findById(user._id || user);
    if (!userDoc) {
      throw new Error('User not found');
    }
    
    return await PeriodOverride.find({
      user: userDoc._id,
      status: { $in: ['pending_approval', 'approved'] },
      expiresAt: { $gt: new Date() }
    })
      .populate('period', 'periodName periodStart periodEnd status')
      .sort({ createdAt: -1 });
  }

  /**
   * Get pending approvals for user
   * @param {Object} user - User (approver)
   * @returns {Promise<Array>} Pending approvals
   */
  async getPendingApprovals(user) {
    const userDoc = await User.findById(user._id || user);
    if (!userDoc) {
      throw new Error('User not found');
    }
    
    // Get overrides that need approval and user hasn't approved yet
    const overrides = await PeriodOverride.find({
      status: 'pending_approval',
      expiresAt: { $gt: new Date() }
    })
      .populate('period', 'periodName periodStart periodEnd status isCritical')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    // Filter out ones user already approved
    return overrides.filter(override => {
      const hasApproved = override.approvals.some(
        a => a.approvedBy.toString() === userDoc._id.toString()
      );
      return !hasApproved;
    });
  }
}

module.exports = new PeriodOverrideService();

