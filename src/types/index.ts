// Orbit 轨迹 - 类型定义

// 用户
export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  storage_used?: number; // 字节 B
  created_at: string;
}

// 好友关系
export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  friend?: User;
  created_at: string;
}

// 地点打卡
export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: string; // 餐厅、景点、咖啡厅等
}

// 记忆卡片
export interface Memory {
  id: string;
  user_id: string;
  location_id: string;
  location?: Location;
  content: string; // 趣事描述
  photos: string[]; // 照片URL数组
  videos?: string[]; // 视频URL数组
  audios?: string[]; // 语音URL数组
  memory_date: string; // 记忆发生的日期
  created_at: string;
  tagged_friends: string[]; // @的好友ID
  has_ledger: boolean; // 是否附带账单
  ledger_id?: string; // 关联的账单ID
  is_owner?: boolean; // 是否是自己创建的记忆（false = 被好友标记进来的）
}

// 账单
export interface Ledger {
  id: string;
  memory_id: string;
  creator_id: string; // 谁创建的账单
  total_amount: number; // 总金额
  currency: string; // 货币类型
  participants: LedgerParticipant[]; // 参与者
  status: 'pending' | 'settled'; // 账单状态
  created_at: string;
  trip_name?: string;
  expense_type?: 'shared' | 'personal';
  description?: string;
}

// 账单参与者
export interface LedgerParticipant {
  user_id: string;
  user?: User;
  amount: number; // 应付金额
  paid: boolean; // 是否已付款
  paid_at?: string;
}

// 结算关系
export interface Settlement {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: 'pending' | 'settled';
  ledger_id?: string;
  created_at: string;
  settled_at?: string;
}

// 地图光点
export interface MapPin {
  id: string;
  location: Location;
  memories: Memory[];
  friends: User[]; // 在此地有过共同回忆的好友
  last_visit: string;
}

// 导航页面类型
export type PageType = 'map' | 'memory' | 'ledger' | 'profile';
