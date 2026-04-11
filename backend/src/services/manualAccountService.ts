import { v4 as uuidv4 } from 'uuid';
import {
  ManualAccount,
  CreateManualAccountDto,
  UpdateManualAccountDto,
} from '../shared/types';
import { DataService } from './dataService';

export class ManualAccountService {
  constructor(private dataService: DataService) {}

  private async loadAccounts(familyId: string): Promise<ManualAccount[]> {
    return (await this.dataService.getData<ManualAccount[]>(`manual_accounts_${familyId}`)) ?? [];
  }

  private async saveAccounts(accounts: ManualAccount[], familyId: string): Promise<void> {
    await this.dataService.saveData(`manual_accounts_${familyId}`, accounts);
  }

  async getAll(familyId: string): Promise<ManualAccount[]> {
    const accounts = await this.loadAccounts(familyId);
    return accounts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(familyId: string, id: string): Promise<ManualAccount | null> {
    const accounts = await this.loadAccounts(familyId);
    return accounts.find((a) => a.id === id) ?? null;
  }

  async create(familyId: string, dto: CreateManualAccountDto): Promise<ManualAccount> {
    const accounts = await this.loadAccounts(familyId);
    const now = new Date().toISOString();

    const account: ManualAccount = {
      id: uuidv4(),
      userId: familyId,
      name: dto.name,
      category: dto.category,
      isAsset: dto.isAsset,
      currentBalance: dto.currentBalance,
      notes: dto.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    accounts.push(account);
    await this.saveAccounts(accounts, familyId);
    return account;
  }

  async update(familyId: string, id: string, dto: UpdateManualAccountDto): Promise<ManualAccount> {
    const accounts = await this.loadAccounts(familyId);
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
    await this.saveAccounts(accounts, familyId);
    return updated;
  }

  async delete(familyId: string, id: string): Promise<void> {
    const accounts = await this.loadAccounts(familyId);
    const index = accounts.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error('Manual account not found');
    }

    accounts.splice(index, 1);
    await this.saveAccounts(accounts, familyId);
  }
}
