import { actOnQueueItem } from "@/lib/api/endpoints/studio/studio";
import type { QueueActDtoAction } from "@/lib/api/model";

export {
  getMyEpisodeQueue as getMySubmissions,
  getEpisodeEngagementControls as getEngagementControls,
} from "@/lib/api/endpoints/engagement/engagement";
export {
  getStudioQueue as getConsoleQueue,
  updateStudioEngagementControls as updateEngagementControls,
} from "@/lib/api/endpoints/studio/studio";
export type {
  EpisodeEngagementControlsDto as EngagementControls,
  EpisodeQueueBudgetDto as SubmissionBudget,
  MyEpisodeQueueItemDto as MySubmission,
  MyEpisodeQueueResponseDto as MySubmissions,
  StudioQueueItemResponseDto as StudioQueueItem,
  StudioQueueResponseDto as StudioQueue,
  QueueActDtoAction as QueueAction,
} from "@/lib/api/model";

export const actOnSubmission = (id: string, action: QueueActDtoAction) => actOnQueueItem(id, { action });
