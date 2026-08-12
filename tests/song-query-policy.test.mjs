import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyNeteaseSongQuery,
  findQqShareUrl,
  findUserSongQueryResult
} from '../electron/song-query-policy.ts';

test('NetEase id= is always an explicit song ID', () => {
  assert.deepEqual(classifyNeteaseSongQuery(' id = 1403356922 '), {
    kind: 'explicit-id',
    songId: '1403356922'
  });
  assert.deepEqual(classifyNeteaseSongQuery('id=42'), {
    kind: 'explicit-id',
    songId: '42'
  });
});

test('a long numeric NetEase query is a suspected ID with keyword fallback', () => {
  assert.deepEqual(classifyNeteaseSongQuery('1403356922'), {
    kind: 'suspected-id',
    songId: '1403356922',
    keyword: '1403356922'
  });
});

test('a short numeric NetEase title remains a normal keyword', () => {
  assert.deepEqual(classifyNeteaseSongQuery('1026'), {
    kind: 'keyword',
    query: '1026'
  });
});

test('QQ accepts full, short and bare share codes', () => {
  const expected = 'https://c6.y.qq.com/base/fcgi-bin/u?__=0eBs266kH6Oj';
  assert.equal(findQqShareUrl(expected), expected);
  assert.equal(findQqShareUrl('u?__=0eBs266kH6Oj'), expected);
  assert.equal(findQqShareUrl('0eBs266kH6Oj'), expected);
});

test('QQ does not reinterpret ordinary numeric or songMid text as a share code', () => {
  assert.equal(findQqShareUrl('1403356922'), null);
  assert.equal(findQqShareUrl('004PRTHB1nPLNT'), null);
  assert.equal(findQqShareUrl('abcde-123456'), null);
  assert.equal(findQqShareUrl('Shelter'), null);
});

test('reports the matching current request before queued duplicates', () => {
  const current = { OrderedByUid: '1001', SongName: '晴天' };
  const queued = [{ OrderedByUid: '1001', SongName: '晴天' }];
  assert.deepEqual(findUserSongQueryResult(1001, '晴天', current, queued), {
    found: true,
    song: current,
    queueAheadCount: 0,
    location: 'current'
  });
});

test('counts every preceding item in the already merged priority and normal queue', () => {
  const target = { OrderedByUid: '1001', SongName: '夜曲' };
  const queue = [
    { OrderedByUid: '2001', SongName: '优先歌曲一' },
    { OrderedByUid: '2002', SongName: '普通歌曲一' },
    target
  ];
  const result = findUserSongQueryResult('1001', '夜曲', null, queue);
  assert.equal(result.found, true);
  assert.equal(result.song, target);
  assert.equal(result.queueAheadCount, 2);
  assert.equal(result.location, 'queue');
});

test('only finds requests belonging to the querying user', () => {
  const result = findUserSongQueryResult(
    '1001',
    '晴天',
    null,
    [{ OrderedByUid: '2002', SongName: '晴天' }]
  );
  assert.deepEqual(result, {
    found: false,
    song: null,
    queueAheadCount: 0,
    location: 'missing'
  });
});

test('uses the earliest queued duplicate for the same user', () => {
  const first = { OrderedByUid: '1001', SongName: '晴天（Live）' };
  const second = { OrderedByUid: '1001', SongName: '晴天' };
  const result = findUserSongQueryResult('1001', '晴天', null, [first, second]);
  assert.equal(result.song, first);
  assert.equal(result.queueAheadCount, 0);
});

test('matches the real song returned by search instead of the wording the user sent', () => {
  const requestedSong = {
    Id: '186016',
    PlayerKey: 'netease',
    OrderedByUid: '1001',
    SongName: '晴天',
    ArtistName: '周杰伦'
  };
  const resolvedSearchResult = {
    Id: '186016',
    PlayerKey: 'netease',
    SongName: '晴天',
    ArtistName: '周杰伦'
  };
  const result = findUserSongQueryResult('1001', resolvedSearchResult, null, [requestedSong]);
  assert.equal(result.found, true);
  assert.equal(result.song, requestedSong);
});

test('does not confuse different resolved song IDs that happen to share a title', () => {
  const result = findUserSongQueryResult(
    '1001',
    { Id: 'song-b', PlayerKey: 'qqmusic', SongName: 'Home' },
    null,
    [{ Id: 'song-a', PlayerKey: 'qqmusic', OrderedByUid: '1001', SongName: 'Home' }]
  );
  assert.equal(result.found, false);
});
