import mongoose from 'mongoose';
import logger from '../utils/logger';

class DatabaseService {
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wp-lead-hunter';

    try {
      await mongoose.connect(mongoUri);
      this.isConnected = true;
      logger.info('Connected to MongoDB');
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { message: (error as Error)?.message || String(error), stack: (error as Error)?.stack, error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await mongoose.disconnect();
    this.isConnected = false;
    logger.info('Disconnected from MongoDB');
  }

  getConnection(): typeof mongoose {
    return mongoose;
  }
}

export const databaseService = new DatabaseService();
export default databaseService;
