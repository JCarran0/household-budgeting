import type { AxiosInstance } from 'axios';
import type {
  StoredProject,
  ProjectSummary,
  CreateProjectDto,
  UpdateProjectDto,
} from '../../../../shared/types';

export function createProjectsApi(client: AxiosInstance) {
  return {
    async createProject(projectData: CreateProjectDto): Promise<StoredProject> {
      const { data: project } = await client.post<StoredProject>('/projects', projectData);
      return project;
    },

    async getProjects(year?: number): Promise<StoredProject[]> {
      const { data } = await client.get<StoredProject[]>('/projects', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async getProject(id: string): Promise<StoredProject> {
      const { data } = await client.get<StoredProject>(`/projects/${id}`);
      return data;
    },

    async getProjectSummary(id: string): Promise<ProjectSummary> {
      const { data } = await client.get<ProjectSummary>(`/projects/${id}/summary`);
      return data;
    },

    async getProjectsSummaries(year?: number): Promise<ProjectSummary[]> {
      const { data } = await client.get<ProjectSummary[]>('/projects/summaries', {
        params: year !== undefined ? { year } : undefined,
      });
      return data;
    },

    async updateProject(id: string, updates: UpdateProjectDto): Promise<StoredProject> {
      const { data } = await client.put<StoredProject>(`/projects/${id}`, updates);
      return data;
    },

    async deleteProject(id: string): Promise<void> {
      await client.delete(`/projects/${id}`);
    },
  };
}
