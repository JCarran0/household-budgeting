import { v4 as uuidv4 } from 'uuid';
import { DataService } from './dataService';
import type { AccountOwnerMapping } from '../shared/types';

export class AccountOwnerMappingService {
  private dataService: DataService;

  constructor(dataService: DataService) {
    this.dataService = dataService;
  }

  private key(familyId: string): string {
    return `account_owner_mappings_${familyId}`;
  }

  async getMappings(familyId: string): Promise<AccountOwnerMapping[]> {
    const data = await this.dataService.getData<AccountOwnerMapping[]>(this.key(familyId));
    return data || [];
  }

  async createMapping(
    familyId: string,
    data: { cardIdentifier: string; displayName: string; linkedUserId?: string },
  ): Promise<AccountOwnerMapping> {
    const mappings = await this.getMappings(familyId);

    const mapping: AccountOwnerMapping = {
      id: uuidv4(),
      cardIdentifier: data.cardIdentifier,
      displayName: data.displayName,
      linkedUserId: data.linkedUserId,
    };

    mappings.push(mapping);
    await this.dataService.saveData(this.key(familyId), mappings);
    return mapping;
  }

  async updateMapping(
    familyId: string,
    mappingId: string,
    updates: Partial<Pick<AccountOwnerMapping, 'cardIdentifier' | 'displayName' | 'linkedUserId'>>,
  ): Promise<AccountOwnerMapping> {
    const mappings = await this.getMappings(familyId);
    const index = mappings.findIndex(m => m.id === mappingId);

    if (index === -1) {
      throw new Error('Mapping not found');
    }

    mappings[index] = { ...mappings[index], ...updates };
    await this.dataService.saveData(this.key(familyId), mappings);
    return mappings[index];
  }

  async deleteMapping(familyId: string, mappingId: string): Promise<void> {
    const mappings = await this.getMappings(familyId);
    const filtered = mappings.filter(m => m.id !== mappingId);

    if (filtered.length === mappings.length) {
      throw new Error('Mapping not found');
    }

    await this.dataService.saveData(this.key(familyId), filtered);
  }

  async getDisplayName(familyId: string, cardIdentifier: string): Promise<string | null> {
    const mappings = await this.getMappings(familyId);
    const mapping = mappings.find(m => m.cardIdentifier === cardIdentifier);
    return mapping?.displayName ?? null;
  }
}
