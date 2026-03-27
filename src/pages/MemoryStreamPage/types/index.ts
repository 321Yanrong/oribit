export interface LocationPoi {
  id: string;
  name: string;
  address: string;
  location: string; // "lng,lat"
  type: string;
}

export interface MemoryCommentItem {
  id: string;
  memory_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface MemoryReactionState {
  liked: boolean;
  likes: number;
  roastOpen: boolean;
}

export interface LedgerItem {
  id: string;
  category: string;
  note: string;
  amount: string;
}
