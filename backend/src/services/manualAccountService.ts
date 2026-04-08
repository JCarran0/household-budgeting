import { v4 as uuidv4 } from 'uuid';
import {
  ManualAccount,
  CreateManualAccountDto,
  UpdateManualAccountDto,
} from '../shared/types';
import { DataService } from './dataService';

export class ManualAccountService {
  constructor(private dataService: DataService) {}

  private async loadAccounts(userId: string): Promise<ManualAccount[]> {
    return (await this.dataService.getData<ManualAccount[]>(`manual_accounts_${userId}`)) ?? [];
  }

  private async saveAccounts(accounts: ManualAccount[], userId: string): Promise<void> {
    await this.dataService.saveData(`manual_accounts_${userId}`, accounts);
  }

  async getAll(userId: string): Promise<ManualAccount[]> {
    const accounts = await this.loadAccounts(userId);
    return accounts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(userId: string, id: string): Promise<ManualAccount | null> {
    const accounts = await this.loadAccounts(userId);
    return accounts.find((a) => a.id === id) ?? null;
  }

  async create(userId: string, dto: CreateManualAccountDto): Promise<ManualAccount> {
    const accounts = await this.loadAccounts(userId);
    const now = new Date().toISOString();

    const account: ManualAccount = {
      id: uuidv4(),
      userId,
      name: dto.name,
      category: dto.category,
      isAsset: dto.isAsset,
      currentBalance: dto.currentBalance,
      notes: dto.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    accounts.push(account);
    await this.saveAccounts(accounts, userId);
    return account;
  }

  async update(userId: string, id: string, dto: UpdateManualAccountDto): Promise<ManualAccount> {
    const accounts = await this.loadAccounts(userId);
    const index = accounts.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error('Manual account not found');
    }

    const existing = accounts[index];
    const updated: ManualAccount = {
      ...existing,
      name: dto.name ?? existing.name,
      category: dto.category ?? existing.category,
      isAsset: dto.isAsset !== undefined ? dto.isAsset : existing.isAsset,
      currentBalance: dto.currentBalance !== undefined ? dto.currentBalance : existing.currentBalance,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    accounts[index] = updated;
    await this.saveAccounts(accounts, userId);
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const accounts = await this.loadAccounts(userId);
    const index = accounts.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error('Manual account not found');
    }

    accounts.splice(index, 1);
    await this.saveAccounts(accounts, userId);
  }
}
