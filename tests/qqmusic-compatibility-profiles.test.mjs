import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QQMUSIC_COMPATIBILITY_PROFILES
} from '../electron/qqmusic-compatibility-profiles.ts';

test('QQ Music 21.92 compatibility profile stays locked to both DLL hashes', () => {
  const profile = QQMUSIC_COMPATIBILITY_PROFILES['21.92.json'];

  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.fileVersion, '21.92');
  assert.equal(
    profile.clientSha256,
    '1DBBF00F1E3DC65A9F6C7BA5AF8F8D4B57440F909E84EDD64B80B869EAE390D9'
  );
  assert.equal(
    profile.commonSha256,
    'EC9AB72AFE3108FBCBB5849BFFE4015D42A9F2CB89494F6AF4894D2C4A270889'
  );
});

test('QQ Music 21.92 profile contains the calibrated native-next call chain', () => {
  const profile = QQMUSIC_COMPATIBILITY_PROFILES['21.92.json'];

  assert.deepEqual({
    singleSongPlayDispatchRva: profile.singleSongPlayDispatchRva,
    expectedPlayDispatchBytes: profile.expectedPlayDispatchBytes,
    songItemConstructorRva: profile.songItemConstructorRva,
    songItemDestructorRva: profile.songItemDestructorRva,
    addSongsRva: profile.addSongsRva,
    hiddenCategoryIdRva: profile.hiddenCategoryIdRva,
    getListRootRva: profile.getListRootRva,
    getListHelperRva: profile.getListHelperRva,
    getCategoryCountRva: profile.getCategoryCountRva,
    songItemSize: profile.songItemSize
  }, {
    singleSongPlayDispatchRva: '0x00460677',
    expectedPlayDispatchBytes: 'E8 84 02 16 00',
    songItemConstructorRva: '0x00044200',
    songItemDestructorRva: '0x00043D40',
    addSongsRva: '0x00411C80',
    hiddenCategoryIdRva: '0x00AFD9F0',
    getListRootRva: '0x005E3470',
    getListHelperRva: '0x005E35D0',
    getCategoryCountRva: '0x004C0570',
    songItemSize: '0xA0'
  });
});
