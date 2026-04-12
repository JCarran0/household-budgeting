/**
 * Task Template Service
 *
 * Manages pre-configured task templates for quick one-tap creation.
 * Templates are family-scoped — all family members share the same set.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredTaskTemplate,
  CreateTaskTemplateDto,
  UpdateTaskTemplateDto,
} from '../shared/types';
import { DataService } from './dataService';

export class TaskTemplateService {
  constructor(private dataService: DataService) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadTemplates(familyId: string): Promise<StoredTaskTemplate[]> {
    return (
      (await this.dataService.getData<StoredTaskTemplate[]>(
        `task_templates_${familyId}`
      )) ?? []
    );
  }

  private async saveTemplates(
    templates: StoredTaskTemplate[],
    familyId: string
  ): Promise<void> {
    await this.dataService.saveData(`task_templates_${familyId}`, templates);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async createTemplate(
    data: CreateTaskTemplateDto,
    familyId: string
  ): Promise<StoredTaskTemplate> {
    const templates = await this.loadTemplates(familyId);

    const maxSort = templates.reduce((max, t) => Math.max(max, t.sortOrder), 0);
    const now = new Date().toISOString();

    const template: StoredTaskTemplate = {
      id: uuidv4(),
      familyId,
      name: data.name,
      defaultAssigneeId: data.defaultAssigneeId ?? null,
      defaultScope: data.defaultScope ?? 'family',
      sortOrder: maxSort + 1,
      createdAt: now,
      updatedAt: now,
    };

    templates.push(template);
    await this.saveTemplates(templates, familyId);

    return template;
  }

  async getTemplates(familyId: string): Promise<StoredTaskTemplate[]> {
    const templates = await this.loadTemplates(familyId);
    return templates.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async updateTemplate(
    templateId: string,
    data: UpdateTaskTemplateDto,
    familyId: string
  ): Promise<StoredTaskTemplate> {
    const templates = await this.loadTemplates(familyId);
    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) {
      throw new Error('Template not found');
    }

    const existing = templates[index];
    const now = new Date().toISOString();

    const updated: StoredTaskTemplate = {
      ...existing,
      name: data.name ?? existing.name,
      defaultAssigneeId:
        data.defaultAssigneeId !== undefined
          ? data.defaultAssigneeId
          : existing.defaultAssigneeId,
      defaultScope: data.defaultScope ?? existing.defaultScope,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      updatedAt: now,
    };

    templates[index] = updated;
    await this.saveTemplates(templates, familyId);

    return updated;
  }

  async deleteTemplate(templateId: string, familyId: string): Promise<void> {
    const templates = await this.loadTemplates(familyId);
    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) {
      throw new Error('Template not found');
    }

    templates.splice(index, 1);
    await this.saveTemplates(templates, familyId);
  }

  async reorderTemplates(
    orderedIds: string[],
    familyId: string
  ): Promise<StoredTaskTemplate[]> {
    const templates = await this.loadTemplates(familyId);
    const now = new Date().toISOString();

    // Assign sortOrder based on position in the orderedIds array
    for (let i = 0; i < orderedIds.length; i++) {
      const template = templates.find((t) => t.id === orderedIds[i]);
      if (template) {
        template.sortOrder = i + 1;
        template.updatedAt = now;
      }
    }

    await this.saveTemplates(templates, familyId);
    return templates.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
