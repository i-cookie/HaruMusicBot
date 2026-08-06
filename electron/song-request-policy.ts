export interface RequestedSongLike {
  OrderedByUid?: string | number | null;
}

function sameUser(
  left: string | number | null | undefined,
  right: string | number | null | undefined
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  return String(left) === String(right);
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
