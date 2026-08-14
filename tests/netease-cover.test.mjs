import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNeteaseCoverUrlFromPicId
} from '../electron/netease-cover.ts';
import { searchNeteaseWithFallback } from '../electron/netease-search.ts';

test('NetEase picId is converted to its signed CDN cover URL', () => {
  assert.equal(
    buildNeteaseCoverUrlFromPicId('109951165911363831'),
    'https://p1.music.126.net/2qW-OYZod7SgrzxTwtyBqA==/109951165911363831.jpg'
  );
});

test('invalid NetEase picId does not produce a cover URL', () => {
  assert.equal(buildNeteaseCoverUrlFromPicId('not-an-id'), '');
});

test('NetEase falls back to direct search when the connector returns empty', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://music.163.com/api/search/get/');
    assert.equal(init?.method, 'POST');
    assert.match(String(init?.body), /s=%E5%91%A8%E6%9D%B0%E4%BC%A6/);
    return new Response(JSON.stringify({
      code: 200,
      result: {
        songs: [{
          id: 5257138,
          name: '屋顶',
          artists: [{ name: '周杰伦' }, { name: '温岚' }],
          album: {
            name: '男女情歌对唱冠军全记录',
            picId: '109951165671182684'
          }
        }]
      }
    }));
  };

  const tracks = await searchNeteaseWithFallback(
    '周杰伦',
    async () => [],
    song => buildNeteaseCoverUrlFromPicId(song.album.picId)
  );

  assert.equal(tracks.length, 1);
  assert.deepEqual(tracks[0], {
    id: '5257138',
    title: '屋顶',
    artist: '周杰伦 / 温岚',
    album: '男女情歌对唱冠军全记录',
    coverUrl: buildNeteaseCoverUrlFromPicId('109951165671182684'),
    nativeData: ''
  });
});

test('NetEase keeps connector results without a fallback request', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error('unexpected fallback');
  };
  const expected = [{
    id: '1',
    title: 'Connector result',
    artist: '',
    album: '',
    coverUrl: ''
  }];
  assert.deepEqual(await searchNeteaseWithFallback(
    'test',
    async () => expected,
    () => ''
  ), expected);
  assert.equal(fetched, false);
});
