export interface RequestedSongLike {
  OrderedByUid?: string | number | null;
}

export function sameUser(
  left: string | number | null | undefined,
  right: string | number | null | undefined
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  return String(left) === String(right);
}

export function userIdInList(
  userUid: string | number | null | undefined,
  userUids: Array<string | number | null | undefined> | null | undefined
): boolean {
  if (userUid === null || userUid === undefined || String(userUid) === '') {
    return false;
  }
  return (userUids || []).some(uid => sameUser(uid, userUid));
}

export function normalizeUserIdList(
  userUids: Array<string | number | null | undefined> | null | undefined
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const uid of userUids || []) {
    const value = String(uid ?? '').trim();
    if (!/^\d+$/.test(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function hasPendingSongRequestByUser(
  userUid: string | number | null | undefined,
  queue: RequestedSongLike[],
  currentPlayingSong: RequestedSongLike | null | undefined
): boolean {
  if (userUid === null || userUid === undefined || String(userUid) === '') {
    return false;
  }

  if (sameUser(currentPlayingSong?.OrderedByUid, userUid)) {
    return true;
  }

  return queue.some(song => sameUser(song?.OrderedByUid, userUid));
}
