import { Category, Family } from '../shared/types';
import { StorageAdapter, StorageFactory } from './storage';

export interface User {
  id: string;
  username: string;
  displayName: string;
  familyId: string;
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

  // Family methods
  getFamilies(): Promise<Family[]>;
  getFamily(familyId: string): Promise<Family | null>;
  createFamily(family: Family): Promise<void>;
  updateFamily(familyId: string, updates: Partial<Family>): Promise<void>;

  // Category methods
  getCategories(familyId: string): Promise<Category[]>;
  saveCategories(categories: Category[], familyId: string): Promise<void>;

  // Generic data storage methods
  getData<T>(key: string): Promise<T | null>;
  saveData<T>(key: string, data: T): Promise<void>;
  deleteData(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

/**
 * Unified data service that uses storage adapters
 * Automatically switches between filesystem (dev) and S3 (production)
 */
export class UnifiedDataService implements DataService {
  private storage: StorageAdapter;
  private readonly USERS_KEY = 'users';
  private readonly FAMILIES_KEY = 'families';

  constructor(storage?: StorageAdapter) {
    this.storage = storage || StorageFactory.getAdapter();
    this.ensureInitialData();
  }

  private async ensureInitialData(): Promise<void> {
    // Ensure users file exists
    if (!(await this.storage.exists(this.USERS_KEY))) {
      await this.storage.write(this.USERS_KEY, { users: [] });
    }
    // Ensure families file exists
    if (!(await this.storage.exists(this.FAMILIES_KEY))) {
      await this.storage.write(this.FAMILIES_KEY, { families: [] });
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

  // Family Management Methods
  private async readFamilies(): Promise<Family[]> {
    try {
      const data = await this.storage.read<{ families: Family[] }>(this.FAMILIES_KEY);
      return data?.families || [];
    } catch (error) {
      console.error('Error reading families:', error);
      return [];
    }
  }

  private async writeFamilies(families: Family[]): Promise<void> {
    await this.storage.write(this.FAMILIES_KEY, { families });
  }

  async getFamilies(): Promise<Family[]> {
    return await this.readFamilies();
  }

  async getFamily(familyId: string): Promise<Family | null> {
    const families = await this.readFamilies();
    return families.find(f => f.id === familyId) || null;
  }

  async createFamily(family: Family): Promise<void> {
    const families = await this.readFamilies();
    families.push(family);
    await this.writeFamilies(families);
  }

  async updateFamily(familyId: string, updates: Partial<Family>): Promise<void> {
    const families = await this.readFamilies();
    const index = families.findIndex(f => f.id === familyId);

    if (index === -1) {
      throw new Error(`Family not found: ${familyId}`);
    }

    families[index] = {
      ...families[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.writeFamilies(families);
  }

  // Category Methods
  async getCategories(familyId: string): Promise<Category[]> {
    const key = `categories_${familyId}`;
    const data = await this.storage.read<{ categories: Category[] }>(key);
    return data?.categories || [];
  }

  async saveCategories(categories: Category[], familyId: string): Promise<void> {
    const key = `categories_${familyId}`;
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

  async listKeys(prefix: string): Promise<string[]> {
    return this.storage.list(prefix);
  }
}

// In-memory implementation for testing
export class InMemoryDataService implements DataService {
  private users: User[] = [];
  private families: Family[] = [];
  private userCategories: Map<string, Category[]> = new Map();
  private genericData: Map<string, unknown> = new Map();

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

  async getFamilies(): Promise<Family[]> {
    return this.families;
  }

  async getFamily(familyId: string): Promise<Family | null> {
    return this.families.find(f => f.id === familyId) || null;
  }

  async createFamily(family: Family): Promise<void> {
    this.families.push(family);
  }

  async updateFamily(familyId: string, updates: Partial<Family>): Promise<void> {
    const index = this.families.findIndex(f => f.id === familyId);
    if (index === -1) {
      throw new Error(`Family not found: ${familyId}`);
    }

    this.families[index] = {
      ...this.families[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  async getCategories(familyId: string): Promise<Category[]> {
    return this.userCategories.get(familyId) || [];
  }

  async saveCategories(categories: Category[], familyId: string): Promise<void> {
    this.userCategories.set(familyId, categories);
  }

  async getData<T>(key: string): Promise<T | null> {
    return (this.genericData.get(key) as T) || null;
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    this.genericData.set(key, data);
  }

  async deleteData(key: string): Promise<void> {
    this.genericData.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    return Array.from(this.genericData.keys()).filter(k => k.startsWith(prefix));
  }

  // Test helper method to clear all data
  clear(): void {
    this.users = [];
    this.families = [];
    this.userCategories.clear();
    this.genericData.clear();
  }
}