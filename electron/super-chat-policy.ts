export interface SuperChatCommandUser {
  uid: string;
  name: string;
  uname: string;
  avatar: string;
  isManager: boolean;
  medalLevel: number;
  guardLevel: number;
  isSuperChat: true;
  superChatPrice: number;
}

export interface SuperChatCommand {
  user: SuperChatCommandUser;
  message: string;
}

function finiteNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseSuperChatCommand(doc: unknown): SuperChatCommand | null {
  if (!doc || typeof doc !== 'object') return null;

  const record = doc as Record<string, unknown>;
  if (record.cmd !== 'SUPER_CHAT_MESSAGE') return null;
  if (!record.data || typeof record.data !== 'object') return null;

  const data = record.data as Record<string, unknown>;
  const message = String(data.message ?? '').trim();
  const uid = String(data.uid ?? '').replace(/"/g, '').trim();
  if (!message || !uid) return null;

  const userInfo = data.user_info && typeof data.user_info === 'object'
    ? data.user_info as Record<string, unknown>
    : {};
  const medalInfo = data.medal_info && typeof data.medal_info === 'object'
    ? data.medal_info as Record<string, unknown>
    : {};
  const uname = String(userInfo.uname ?? '').trim() || `游客${uid.slice(-6)}`;
  const guardLevel = finiteNonNegativeNumber(
    userInfo.guard_level ?? medalInfo.guard_level
  );

  return {
    message,
    user: {
      uid,
      name: uname,
      uname,
      avatar: String(userInfo.face ?? '').trim(),
      isManager: userInfo.manager === true || Number(userInfo.manager) === 1,
      medalLevel: finiteNonNegativeNumber(medalInfo.medal_level),
      guardLevel,
      isSuperChat: true,
      superChatPrice: finiteNonNegativeNumber(data.price)
    }
  };
}

export function getBasicSongRequestKeyword(message: string): string | null {
  const normalized = String(message || '').trim();
  if (!normalized.startsWith('点歌') && !normalized.startsWith('點歌')) return null;
  return normalized.substring(2).trim() || null;
}
