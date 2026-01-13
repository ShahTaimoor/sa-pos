const BaseRepository = require('./BaseRepository');
const Settings = require('../models/Settings');

class SettingsRepository extends BaseRepository {
  constructor() {
    super(Settings);
  }

  /**
   * Get settings (tenant-specific)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getSettings(tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get settings');
    }
    // Settings is tenant-specific - use the static method from the model
    return Settings.getSettings(tenantId);
  }

  /**
   * Update settings (tenant-specific)
   * @param {object} updates - Update data
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async updateSettings(updates, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to update settings');
    }
    // Settings is tenant-specific - use the static method from the model
    return Settings.updateSettings(updates, tenantId);
  }
}

module.exports = new SettingsRepository();

