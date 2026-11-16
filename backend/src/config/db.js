import mongoose from 'mongoose';
import logger from '../utils/logger.js';

let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    logger.info('[MongoDB] Connected to database successfully.');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`[MongoDB] Connection error: ${err.message}`, { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('[MongoDB] Disconnected from database.');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('[MongoDB] Reconnected to database.');
  });
}

/**
 * Connects to MongoDB Atlas (or configured MongoDB URI) using Mongoose.
 * Implements connection pooling, timeout tuning, and connection retries.
 */
export async function connectDB(uri = process.env.MONGODB_URI, maxRetries = 3) {
  if (!uri || !uri.trim()) {
    throw new Error('MONGODB_URI environment variable is not set.');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Production safety: reject localhost / development databases in production
  if (isProduction && (uri.includes('127.0.0.1') || uri.includes('localhost'))) {
    throw new Error(
      '[Security Error] Insecure MongoDB connection. Production requires a secure, TLS-enabled MongoDB Atlas or remote replica set URI.'
    );
  }

  registerConnectionListeners();

  const options = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
    maxPoolSize: Number(process.env.DB_MAX_POOL_SIZE) || (isProduction ? 50 : 10),
    minPoolSize: Number(process.env.DB_MIN_POOL_SIZE) || (isProduction ? 5 : 1),
    autoIndex: !isProduction, // In production, indexes are built ahead of time or via migrations
    retryWrites: true,
  };

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await mongoose.connect(uri, options);
      return connection;
    } catch (error) {
      lastError = error;
      logger.error(
        `[MongoDB] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );
      if (attempt < maxRetries) {
        const delayMs = attempt * 1500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Gracefully closes MongoDB connection
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info('[MongoDB] Database connection closed cleanly.');
    } catch (err) {
      logger.error(`[MongoDB] Error during disconnect: ${err.message}`);
    }
  }
}

export default connectDB;
