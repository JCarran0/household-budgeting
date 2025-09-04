import { Category } from '../../../shared/types';
import { StorageAdapter, StorageFactory } from './storage';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt?: Date;
  lastLogin?: Date;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
}

export interface DataService {
  // User-specific methods
  getUser(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | null>;
  getAllUsers(): Promise<User[]>;
  
  // Category methods
  getCategories(userId: string): Promise<Category[]>;
  saveCategories(categories: Category[], userId: string): Promise<void>;
  
  // Generic data storage methods
  getData<T>(key: string): Promise<T | null>;
  saveData<T>(key: string, data: T): Promise<void>;
  deleteData(key: string): Promise<void>;
}

/**
 * Unified data service that uses storage adapters
 * Automatically switches between filesystem (dev) and S3 (production)
 */
export class UnifiedDataService implements DataService {
  private storage: StorageAdapter;
  private readonly USERS_KEY = 'users';

  constructor(storage?: StorageAdapter) {
    this.storage = storage || StorageFactory.getAdapter();
    this.ensureInitialData();
  }

  private async ensureInitialData(): Promise<void> {
    // Ensure users file exists
    if (!(await this.storage.exists(this.USERS_KEY))) {
      await this.storage.write(this.USERS_KEY, { users: [] });
    }
  }

  // User Management Methods
  private async readUsers(): Promise<User[]> {
    try {
      const data = await this.storage.read<{ users: User[] }>(this.USERS_KEY);
      return data?.users || [];
    } catch (error) {
      console.error('Error reading users:', error);
      return [];
    }
  }

  private async writeUsers(users: User[]): Promise<void> {
    await this.storage.write(this.USERS_KEY, { users });
  }

  async getUser(id: string): Promise<User | null> {
    const users = await this.readUsers();
    return users.find(u => u.id === id) || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const users = await this.readUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  }

  async createUser(user: User): Promise<User> {
    const users = await this.readUsers();
    users.push(user);
    await this.writeUsers(users);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const users = await this.readUsers();
    const index = users.findIndex(u => u.id === id);
    
    if (index === -1) {
      return null;
    }

    users[index] = {
      ...users[index],
      ...updates,
      updatedAt: new Date(),
    };

    await this.writeUsers(users);
    return users[index];
  }

  async getAllUsers(): Promise<User[]> {
    return await this.readUsers();
  }

  // Category Methods
  async getCategories(userId: string): Promise<Category[]> {
    // User-specific categories
    const key = `categories_${userId}`;
    const data = await this.storage.read<{ categories: Category[] }>(key);
    return data?.categories || [];
  }

  async saveCategories(categories: Category[], userId: string): Promise<void> {
    // Save user-specific categories
    const key = `categories_${userId}`;
    await this.storage.write(key, { categories });
  }

  // Generic Data Storage Methods
  async getData<T>(key: string): Promise<T | null> {
    return await this.storage.read<T>(key);
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    await this.storage.write(key, data);
  }

  async deleteData(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}

// In-memory implementation for testing
export class InMemoryDataService implements DataService {
  private users: User[] = [];
  private userCategories: Map<string, Category[]> = new Map();
  private genericData: Map<string, any> = new Map();

  async getUser(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return this.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  }

  async createUser(user: User): Promise<User> {
    this.users.push(user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;
    
    this.users[index] = {
      ...this.users[index],
      ...updates,
      updatedAt: new Date(),
    };
    
    return this.users[index];
  }

  async getAllUsers(): Promise<User[]> {
    return this.users;
  }

  async getCategories(userId: string): Promise<Category[]> {
    return this.userCategories.get(userId) || [];
  }

  async saveCategories(categories: Category[], userId: string): Promise<void> {
    this.userCategories.set(userId, categories);
  }

  async getData<T>(key: string): Promise<T | null> {
    return this.genericData.get(key) || null;
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    this.genericData.set(key, data);
  }

  async deleteData(key: string): Promise<void> {
    this.genericData.delete(key);
  }

  // Test helper method to clear all data
  clear(): void {
    this.users = [];
    this.userCategories.clear();
    this.genericData.clear();
  }
}