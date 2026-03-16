type FriendRecord = any;

type CurrentUser = {
  id?: string;
  username?: string | null;
} | null;

const getFriendRecord = (friends: FriendRecord[] = [], friendId: string) => {
  return friends.find((f: any) => f?.friend?.id === friendId || f?.friend_id === friendId || f?.id === friendId || f?.user_id === friendId);
};

const getFriendNameFromRecord = (record: FriendRecord | undefined | null) => {
  if (!record) return null;
  return (
    record.friend?.username ||
    record.username ||
    record.friend_name ||
    record.real_username ||
    null
  );
};

export const getVisibleTaggedFriendIds = (
  taggedIds: string[] = [],
  memoryOwnerId: string | null | undefined,
  currentUserId: string | null | undefined,
  friends: FriendRecord[] = []
) => {
  if (!taggedIds.length || !currentUserId) return [];
  const friendIdSet = new Set(
    friends.map((f: any) => f?.friend?.id || f?.friend_id).filter(Boolean)
  );

  return taggedIds.filter((id) => {
    if (!id) return false;
    if (id.startsWith('temp-')) return currentUserId === memoryOwnerId;
    if (currentUserId === memoryOwnerId) return true;
    if (id === currentUserId) return true;
    return friendIdSet.has(id);
  });
};

export const getTaggedDisplayName = (
  friendId: string,
  memoryOwnerId: string | null | undefined,
  currentUser: CurrentUser,
  friends: FriendRecord[] = []
) => {
  if (!friendId) return null;
  const currentUserId = currentUser?.id;

  if (friendId.startsWith('temp-')) {
    if (currentUserId !== memoryOwnerId) return null;
    const fid = friendId.replace('temp-', '');
    const vf = friends.find((f: any) => f?.id === fid);
    return vf?.friend_name || null;
  }

  if (friendId === currentUserId) {
    return currentUser?.username || '我';
  }

  const record = getFriendRecord(friends, friendId);
  const name = getFriendNameFromRecord(record);
  if (name) return name;

  if (currentUserId && currentUserId === memoryOwnerId) {
    return '已不是好友';
  }

  return null;
};
