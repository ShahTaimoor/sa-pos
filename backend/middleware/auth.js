const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/UserRepository');

const auth = async (req, res, next) => {
  try {
    // Try to get token from HTTP-only cookie first, then fall back to Authorization header
    let token = req.cookies?.token;
    
    if (!token) {
      // Fallback to Authorization header for backward compatibility
      token = req.header('Authorization')?.replace('Bearer ', '');
    }
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userRepository.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'User account is not active' });
    }
    
    // Extract tenantId from JWT (never trust frontend)
    const tenantId = decoded.tenantId || user.tenantId;
    if (!tenantId) {
      return res.status(401).json({ message: 'Tenant ID missing from token' });
    }
    
    // Verify tenantId matches user's tenantId
    if (user.tenantId && user.tenantId.toString() !== tenantId.toString()) {
      return res.status(403).json({ message: 'Tenant ID mismatch' });
    }
    
    req.user = user;
    req.tenantId = tenantId; // Add tenantId to request
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.hasPermission(permission)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.' 
      });
    }
    next();
  };
};

// Accepts one or more permission names; passes if the user has ANY of them
const requireAnyPermission = (permissions) => {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return (req, res, next) => {
    const allowed = list.some((p) => req.user.hasPermission(p));
    if (!allowed) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!roleArray.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient role privileges.' 
      });
    }
    next();
  };
};

/**
 * Middleware to handle Super Admin tenant context
 * Super Admin can access any tenant, but regular users are restricted to their tenant
 */
const handleTenantContext = (req, res, next) => {
  // Super Admin can access any tenant (for tenant management)
  // But for regular operations, they should still have a tenantId
  if (req.user.role === 'super_admin') {
    // Super Admin can optionally specify a tenantId in query for tenant management
    // But for their own operations, use their tenantId
    if (!req.tenantId && req.user.tenantId) {
      req.tenantId = req.user.tenantId;
    }
  }
  
  // For all other users, tenantId is required and must match their tenantId
  if (req.user.role !== 'super_admin' && !req.tenantId) {
    return res.status(403).json({ 
      message: 'Tenant ID is required. Please log in again.' 
    });
  }
  
  next();
};

module.exports = {
  auth,
  requirePermission,
  requireAnyPermission,
  requireRole,
  handleTenantContext
};
