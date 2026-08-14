export interface NeteaseSearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  nativeData?: string;
}

const NETEASE_SEARCH_ENDPOINT =
  'https://music.163.com/api/search/get/';

function getChinaBypassHeaders(): Record<string, string> {
  const chinaIps = [
    '218.75.111.114',
    '111.206.176.1',
    '112.12.12.12',
    '223.5.5.5'
  ];
  const fakeIp = chinaIps[Math.floor(Math.random() * chinaIps.length)];
  return {
    'X-Real-IP': fakeIp,
    'X-Forwarded-For': fakeIp
  };
}

function parseNeteaseSearchTrack(
  song: any,
  readCover: (song: any) => string
): NeteaseSearchTrack | null {
  const id = String(song?.id || '').trim();
  const title = String(song?.name || '').trim();
  if (!/^\d{1,19}$/.test(id) || !title) return null;

  const album = song?.album || song?.al || {};
  const artists = song?.artists || song?.ar || [];
  return {
    id,
    title,
    artist: Array.isArray(artists)
      ? artists
        .map((artist: any) => String(artist?.name || '').trim())
        .filter(Boolean)
        .join(' / ')
      : '',
    album: String(album?.name || '').trim(),
    coverUrl: readCover(song),
    nativeData: ''
  };
}

async function searchNeteaseDirect(
  query: string,
  readCover: (song: any) => string
): Promise<NeteaseSearchTrack[]> {
  const content = new URLSearchParams({
    s: query.trim(),
    type: '1',
    limit: '20',
    offset: '0',
    total: 'true'
  });
  const response = await fetch(NETEASE_SEARCH_ENDPOINT, {
    method: 'POST',
    body: content,
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://music.163.com/',
      'Cookie': 'os=pc; appver=3.1.37;',
      ...getChinaBypassHeaders()
    }
  });
  if (!response.ok) {
    throw new Error(`网易云搜索请求失败（HTTP ${response.status}）`);
  }

  const payload = await response.json();
  if (payload?.code !== undefined && Number(payload.code) !== 200) {
    throw new Error(`网易云搜索请求失败（业务码 ${payload.code}）`);
  }
  const songs = payload?.result?.songs;
  if (!Array.isArray(songs)) return [];
  return songs
    .map((song: any) => parseNeteaseSearchTrack(song, readCover))
    .filter((track): track is NeteaseSearchTrack => track !== null);
}

export async function searchNeteaseWithFallback(
  query: string,
  searchConnector: (query: string) => Promise<NeteaseSearchTrack[]>,
  readCover: (song: any) => string
): Promise<NeteaseSearchTrack[]> {
  let connectorError: unknown = null;
  try {
    const tracks = await searchConnector(query);
    if (tracks.length > 0) return tracks;
  } catch (error: unknown) {
    connectorError = error;
  }

  try {
    return await searchNeteaseDirect(query, readCover);
  } catch (error: unknown) {
    if (connectorError) throw connectorError;
    throw error;
  }
}
