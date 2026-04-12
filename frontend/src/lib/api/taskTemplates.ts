import type { AxiosInstance } from 'axios';
import type {
  StoredTaskTemplate,
  CreateTaskTemplateDto,
  UpdateTaskTemplateDto,
} from '../../../../shared/types';

export function createTaskTemplatesApi(client: AxiosInstance) {
  return {
    async createTaskTemplate(data: CreateTaskTemplateDto): Promise<StoredTaskTemplate> {
      const { data: template } = await client.post<StoredTaskTemplate>('/task-templates', data);
      return template;
    },

    async getTaskTemplates(): Promise<StoredTaskTemplate[]> {
      const { data } = await client.get<StoredTaskTemplate[]>('/task-templates');
      return data;
    },

    async updateTaskTemplate(id: string, updates: UpdateTaskTemplateDto): Promise<StoredTaskTemplate> {
      const { data } = await client.put<StoredTaskTemplate>(`/task-templates/${id}`, updates);
      return data;
    },

    async deleteTaskTemplate(id: string): Promise<void> {
      await client.delete(`/task-templates/${id}`);
    },

    async reorderTaskTemplates(orderedIds: string[]): Promise<StoredTaskTemplate[]> {
      const { data } = await client.put<StoredTaskTemplate[]>('/task-templates/reorder', { orderedIds });
      return data;
    },
  };
}
