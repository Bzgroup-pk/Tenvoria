export type Department = 'Research' | 'Development' | 'Media Studio' | 'Growth & Sales' | 'Finance' | 'Quality';
export type TaskStatus = 'Needs approval' | 'In progress' | 'Completed' | 'Rejected';
export type Task = {
  id: string; title: string; department: Department; description: string;
  status: TaskStatus; estimatedCost: number; createdAt: string; output?: string;
};
export type ModelProvider = {
  id: string; name: string; kind: 'LLM' | 'Agent' | 'Image' | 'Video' | 'Speech';
  enabled: boolean; billing: 'Free tier' | 'Paid' | 'Self-hosted'; status: 'Demo' | 'Connected' | 'Not connected';
};
