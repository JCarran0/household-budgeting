import type { AxiosInstance } from 'axios';
import type {
  StoredTask,
  CreateTaskDto,
  UpdateTaskDto,
  TaskStatus,
  LeaderboardResponse,
} from '../../../../shared/types';

export function createTasksApi(client: AxiosInstance) {
  return {
    async createTask(taskData: CreateTaskDto): Promise<StoredTask> {
      const { data } = await client.post<StoredTask>('/tasks', taskData);
      return data;
    },

    async getTasks(): Promise<StoredTask[]> {
      const { data } = await client.get<StoredTask[]>('/tasks');
      return data;
    },

    async getBoardTasks(): Promise<StoredTask[]> {
      const { data } = await client.get<StoredTask[]>('/tasks/board');
      return data;
    },

    async getTask(id: string): Promise<StoredTask> {
      const { data } = await client.get<StoredTask>(`/tasks/${id}`);
      return data;
    },

    async updateTask(id: string, updates: UpdateTaskDto): Promise<StoredTask> {
      const { data } = await client.put<StoredTask>(`/tasks/${id}`, updates);
      return data;
    },

    async updateTaskStatus(id: string, status: TaskStatus): Promise<StoredTask> {
      const { data } = await client.patch<StoredTask>(`/tasks/${id}/status`, { status });
      return data;
    },

    async deleteTask(id: string): Promise<void> {
      await client.delete(`/tasks/${id}`);
    },

    async getLeaderboard(timezone: string): Promise<LeaderboardResponse> {
      const { data } = await client.get<LeaderboardResponse>('/tasks/leaderboard', {
        params: { timezone },
      });
      return data;
    },
  };
}
