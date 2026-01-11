/**
 * Sales Schema Adapter
 * 
 * Adapts old Sales schema versions to current version
 */

const schemaVersionService = require('../services/schemaVersionService');

class SalesAdapter {
  /**
   * Adapt document to current schema version
   * @param {Object} doc - Document
   * @param {String} fromVersion - From version
   * @param {String} toVersion - To version
   * @returns {Object} Adapted document
   */
  adapt(doc, fromVersion, toVersion) {
    if (!doc) return doc;
    
    // Start with copy of document
    let adapted = { ...doc };
    
    // Adapt from version 1.0.0 to 1.1.0
    if (schemaVersionService.compareVersions(fromVersion, '1.1.0') < 0 &&
        schemaVersionService.compareVersions(toVersion, '1.1.0') >= 0) {
      adapted = this.adaptToV1_1_0(adapted);
    }
    
    // Update schema version
    adapted.schemaVersion = toVersion;
    
    return adapted;
  }
  
  /**
   * Adapt to version 1.1.0
   * @param {Object} doc - Document
   * @returns {Object} Adapted document
   */
  adaptToV1_1_0(doc) {
    const adapted = { ...doc };
    
    // Add frozenCOGS to items if missing
    if (adapted.items && Array.isArray(adapted.items)) {
      adapted.items = adapted.items.map(item => {
        if (!item.frozenCOGS) {
          // Create frozenCOGS from existing data
          item.frozenCOGS = {
            unitCost: item.unitCost || 0,
            totalCost: (item.unitCost || 0) * (item.quantity || 0),
            costingMethod: 'average', // Default
            calculatedAt: adapted.createdAt || new Date(),
            isBackfilled: true,
            backfilledAt: new Date(),
            isEstimated: true
          };
        }
        return item;
      });
    }
    
    return adapted;
  }
}

module.exports = new SalesAdapter();

