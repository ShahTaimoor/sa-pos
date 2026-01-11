/**
 * Tenant Middleware
 * 
 * Enforces tenant isolation by:
 * 1. Automatically adding tenantId to all queries
 * 2. Preventing frontend from sending tenantId
 * 3. Ensuring all operations are scoped to the user's tenant
 */

const tenantMiddleware = (req, res, next) => {
  // Get tenantId from request (set by auth middleware)
  const tenantId = req.tenantId || req.user?.tenantId;
  
  if (!tenantId) {
    return res.status(403).json({ 
      message: 'Tenant ID is required. Please log in again.' 
    });
  }
  
  // Remove tenantId from request body if present (security: never trust frontend)
  if (req.body && req.body.tenantId) {
    delete req.body.tenantId;
  }
  
  if (req.query && req.query.tenantId) {
    delete req.query.tenantId;
  }
  
  // Add tenantId to request for use in routes/services
  req.tenantId = tenantId;
  
  // Add tenantId to query filters automatically
  if (!req.queryFilters) {
    req.queryFilters = {};
  }
  req.queryFilters.tenantId = tenantId;
  
  next();
};

/**
 * Date range validation middleware
 * Enforces maximum 2-year query range and prevents lifetime queries
 */
const validateDateRange = (req, res, next) => {
  const { startDate, endDate, dateFrom, dateTo } = req.query;
  
  const start = startDate || dateFrom;
  const end = endDate || dateTo;
  
  if (start || end) {
    const startDateObj = start ? new Date(start) : null;
    const endDateObj = end ? new Date(end) : new Date();
    
    if (startDateObj && isNaN(startDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid start date format' });
    }
    
    if (endDateObj && isNaN(endDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid end date format' });
    }
    
    // Enforce maximum 2-year range
    const maxRange = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds
    if (startDateObj && endDateObj) {
      const range = endDateObj - startDateObj;
      if (range > maxRange) {
        return res.status(400).json({ 
          message: 'Date range cannot exceed 2 years' 
        });
      }
    }
    
    // Prevent lifetime queries (no start date)
    if (!startDateObj && endDateObj) {
      return res.status(400).json({ 
        message: 'Start date is required. Lifetime queries are not allowed.' 
      });
    }
    
    // Set default end date to today if not provided
    if (startDateObj && !endDateObj) {
      req.query.endDate = new Date().toISOString();
      req.query.dateTo = new Date().toISOString();
    }
  }
  
  next();
};

module.exports = {
  tenantMiddleware,
  validateDateRange
};

