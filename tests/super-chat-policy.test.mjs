import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBasicSongRequestKeyword,
  getSongQueryKeyword,
  parseSuperChatCommand
} from '../electron/super-chat-policy.ts';

test('parses a Bilibili super chat into a song-request user', () => {
  const parsed = parseSuperChatCommand({
    cmd: 'SUPER_CHAT_MESSAGE',
    data: {
      uid: 1001,
      message: ' 点歌 晴天 ',
      price: 30,
      user_info: {
        uname: '听众',
        face: 'https://example.com/avatar.jpg',
        manager: 1,
        guard_level: 3
      },
      medal_info: { medal_level: 12 }
    }
  });

  assert.deepEqual(parsed, {
    message: '点歌 晴天',
    user: {
      uid: '1001',
      name: '听众',
      uname: '听众',
      avatar: 'https://example.com/avatar.jpg',
      isManager: true,
      medalLevel: 12,
      guardLevel: 3,
      isSuperChat: true,
      superChatPrice: 30
    }
  });
});

test('rejects non-super-chat events and malformed super chats', () => {
  assert.equal(parseSuperChatCommand({ cmd: 'DANMU_MSG', data: {} }), null);
  assert.equal(parseSuperChatCommand({ cmd: 'SUPER_CHAT_MESSAGE', data: { uid: 1 } }), null);
});

test('extracts a non-empty keyword only from basic 点歌 or 點歌 content', () => {
  assert.equal(getBasicSongRequestKeyword('点歌 晴天'), '晴天');
  assert.equal(getBasicSongRequestKeyword('點歌 晴天'), '晴天');
  assert.equal(getBasicSongRequestKeyword('点歌'), null);
  assert.equal(getBasicSongRequestKeyword('置顶点歌 晴天'), null);
  assert.equal(getBasicSongRequestKeyword('谢谢主播'), null);
});

test('extracts a non-empty keyword from 查询 or 查詢 content', () => {
  assert.equal(getSongQueryKeyword('查询 晴天'), '晴天');
  assert.equal(getSongQueryKeyword('查詢晴天'), '晴天');
  assert.equal(getSongQueryKeyword('查询'), null);
  assert.equal(getSongQueryKeyword('点歌 晴天'), null);
});
