import fs from 'fs-extra';
import path from 'path';

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
  
  // Generic data storage methods
  getData<T>(key: string): Promise<T | null>;
  saveData<T>(key: string, data: T): Promise<void>;
  deleteData(key: string): Promise<void>;
}

export class JSONDataService implements DataService {
  private dataDir: string;
  private usersFile: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || process.env.DATA_DIR || path.join(__dirname, '../../data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.ensureDataFile();
  }

  private async ensureDataFile(): Promise<void> {
    await fs.ensureDir(this.dataDir);
    if (!(await fs.pathExists(this.usersFile))) {
      await fs.writeJson(this.usersFile, { users: [] });
    }
  }

  private async readUsers(): Promise<User[]> {
    const data = await fs.readJson(this.usersFile);
    return data.users || [];
  }

  private async writeUsers(users: User[]): Promise<void> {
    await fs.writeJson(this.usersFile, { users }, { spaces: 2 });
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

  // Generic data storage implementation
  async getData<T>(key: string): Promise<T | null> {
    const filePath = path.join(this.dataDir, `${key}.json`);
    
    try {
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data as T;
      }
      return null;
    } catch (error) {
      console.error(`Error reading data for key ${key}:`, error);
      return null;
    }
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    const filePath = path.join(this.dataDir, `${key}.json`);
    
    try {
      await fs.ensureDir(this.dataDir);
      await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
      console.error(`Error saving data for key ${key}:`, error);
      throw error;
    }
  }

  async deleteData(key: string): Promise<void> {
    const filePath = path.join(this.dataDir, `${key}.json`);
    
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
      console.error(`Error deleting data for key ${key}:`, error);
      throw error;
    }
  }
}

// In-memory implementation for testing
export class InMemoryDataService implements DataService {
  private users: User[] = [];

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
    
    if (index === -1) {
      return null;
    }

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

  // Generic data storage implementation
  private dataStore: Map<string, unknown> = new Map();

  async getData<T>(key: string): Promise<T | null> {
    const data = this.dataStore.get(key);
    return (data as T) || null;
  }

  async saveData<T>(key: string, data: T): Promise<void> {
    this.dataStore.set(key, data);
  }

  async deleteData(key: string): Promise<void> {
    this.dataStore.delete(key);
  }

  // Test helper methods
  clear(): void {
    this.users = [];
    this.dataStore.clear();
  }
}