export type NeteaseSongQuery =
  | { kind: 'keyword'; query: string }
  | { kind: 'explicit-id'; songId: string }
  | { kind: 'suspected-id'; songId: string; keyword: string };

const NETEASE_EXPLICIT_ID_PATTERN = /^id\s*=\s*([0-9]{1,19})$/i;
const NETEASE_SUSPECTED_ID_PATTERN = /^[0-9]{6,19}$/;

export function classifyNeteaseSongQuery(input: string): NeteaseSongQuery {
  const query = input.trim();
  const explicit = query.match(NETEASE_EXPLICIT_ID_PATTERN);
  if (explicit) {
    return { kind: 'explicit-id', songId: explicit[1] };
  }
  if (NETEASE_SUSPECTED_ID_PATTERN.test(query)) {
    return { kind: 'suspected-id', songId: query, keyword: query };
  }
  return { kind: 'keyword', query };
}

const QQ_SHARE_BASE = 'https://c6.y.qq.com/base/fcgi-bin/u?__=';
const QQ_SHARE_CODE_PATTERN = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{12}$/;

export function findQqShareUrl(input: string): string | null {
  const query = input.trim();
  const full = query.match(
    /https?:\/\/c6\.y\.qq\.com\/base\/fcgi-bin\/u\?__=([A-Za-z0-9_-]{6,32})/i
  );
  if (full) return full[0];

  const short = query.match(
    /^(?:u\?__=|c6\.y\.qq\.com\/base\/fcgi-bin\/u\?__=)([A-Za-z0-9_-]{6,32})$/i
  );
  if (short) return `${QQ_SHARE_BASE}${short[1]}`;

  return QQ_SHARE_CODE_PATTERN.test(query)
    ? `${QQ_SHARE_BASE}${query}`
    : null;
}

export interface QueryableSong {
  Id?: unknown;
  OrderedByUid?: unknown;
  SongName?: unknown;
  ArtistName?: unknown;
  PlayerKey?: unknown;
}

export interface SongQueryResult<T extends QueryableSong> {
  found: boolean;
  song: T | null;
  queueAheadCount: number;
  location: 'current' | 'queue' | 'missing';
}

function normalizeUserId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeSongName(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function belongsToUser(song: QueryableSong | null | undefined, userId: unknown): boolean {
  if (!song) return false;
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId.length > 0 && normalizeUserId(song.OrderedByUid) === normalizedUserId;
}

function matchesSongName(song: QueryableSong, keyword: string): boolean {
  const songName = normalizeSongName(song.SongName);
  const normalizedKeyword = normalizeSongName(keyword);
  if (!songName || !normalizedKeyword) return false;
  return songName === normalizedKeyword
    || songName.includes(normalizedKeyword)
    || normalizedKeyword.includes(songName);
}

function matchesResolvedSong(song: QueryableSong, resolvedSong: QueryableSong): boolean {
  const songId = String(song.Id ?? '').trim();
  const resolvedId = String(resolvedSong.Id ?? '').trim();
  const songPlayer = String(song.PlayerKey ?? '').trim();
  const resolvedPlayer = String(resolvedSong.PlayerKey ?? '').trim();
  if (songId && resolvedId && (!songPlayer || !resolvedPlayer || songPlayer === resolvedPlayer)) {
    return songId === resolvedId;
  }

  const songName = normalizeSongName(song.SongName);
  const resolvedName = normalizeSongName(resolvedSong.SongName);
  return Boolean(songName && resolvedName && songName === resolvedName);
}

export function findUserSongQueryResult<T extends QueryableSong>(
  userId: unknown,
  query: string | QueryableSong,
  currentSong: T | null | undefined,
  combinedQueue: T[]
): SongQueryResult<T> {
  const matchesQuery = (song: T): boolean => typeof query === 'string'
    ? matchesSongName(song, query)
    : matchesResolvedSong(song, query);

  if (belongsToUser(currentSong, userId) && matchesQuery(currentSong!)) {
    return {
      found: true,
      song: currentSong!,
      queueAheadCount: 0,
      location: 'current'
    };
  }

  const queueIndex = combinedQueue.findIndex(song => (
    belongsToUser(song, userId) && matchesQuery(song)
  ));
  if (queueIndex >= 0) {
    return {
      found: true,
      song: combinedQueue[queueIndex],
      queueAheadCount: queueIndex,
      location: 'queue'
    };
  }

  return {
    found: false,
    song: null,
    queueAheadCount: 0,
    location: 'missing'
  };
}
