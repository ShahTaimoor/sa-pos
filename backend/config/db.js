const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('../utils/logger');

// Database connection
const connectDB = async () => {
  try {
    // Check if MONGODB_URI is provided
    if (!process.env.MONGODB_URI) {
      logger.error('Error: MONGODB_URI environment variable is required.');
      logger.error('Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }

    const mongoUri = process.env.MONGODB_URI;

    // Connection options
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
      dbName: 'pos_system'
    };

    // Connect only if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, options);
      logger.info(`MongoDB connected successfully to database: ${mongoose.connection.db.databaseName}`);
    } else if (mongoose.connection.readyState === 1) {
      logger.info('MongoDB already connected');
    }

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
      setTimeout(async () => {
        if (mongoose.connection.readyState === 0) {
          try {
            await mongoose.connect(mongoUri, options);
          } catch (err) {
            logger.error('Reconnection failed:', err);
          }
        }
      }, 5000);
    });

  } catch (error) {
    logger.error('MongoDB connection error:', error);
    logger.error('Verify that the connection string is correct and accessible.');
    logger.error('For local MongoDB, ensure MongoDB service is running.');
    logger.error('For Atlas, ensure your IP is whitelisted.');
    process.exit(1);
  }
};

module.exports = connectDB;

