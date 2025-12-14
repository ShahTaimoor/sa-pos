const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'User account is not active' });
    }
    
    req.user = user;
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
    if (!roleArray.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient role privileges.' 
      });
    }
    next();
  };
};

module.exports = {
  auth,
  requirePermission,
  requireAnyPermission,
  requireRole
};
