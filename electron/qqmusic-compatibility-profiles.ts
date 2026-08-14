export interface QQMusicCompatibilityProfile {
  schemaVersion: 1;
  fileVersion: string;
  clientSha256: string;
  commonSha256: string;
  singleSongPlayDispatchRva: string;
  expectedPlayDispatchBytes: string;
  getCatManagerRva: string;
  getQqUinExRva: string;
  songItemConstructorRva: string;
  songItemDestructorRva: string;
  addSongsRva: string;
  hiddenCategoryIdRva: string;
  getListRootRva: string;
  getListHelperRva: string;
  getCategoryCountRva: string;
  songItemSize: string;
  evidence: string;
}

// Profiles here are bundled with the signed desktop application and are
// merged with the separately signed online profile package at launch. The
// connector still requires an exact version and two-DLL hash match before it
// permits any process write.
export const QQMUSIC_COMPATIBILITY_PROFILES: Readonly<
  Record<string, QQMusicCompatibilityProfile>
> = Object.freeze({
  '21.92.json': Object.freeze({
    schemaVersion: 1,
    fileVersion: '21.92',
    clientSha256:
      '1DBBF00F1E3DC65A9F6C7BA5AF8F8D4B57440F909E84EDD64B80B869EAE390D9',
    commonSha256:
      'EC9AB72AFE3108FBCBB5849BFFE4015D42A9F2CB89494F6AF4894D2C4A270889',
    singleSongPlayDispatchRva: '0x00460677',
    expectedPlayDispatchBytes: 'E8 84 02 16 00',
    getCatManagerRva: '0x0000F071',
    getQqUinExRva: '0x0002DFA9',
    songItemConstructorRva: '0x00044200',
    songItemDestructorRva: '0x00043D40',
    addSongsRva: '0x00411C80',
    hiddenCategoryIdRva: '0x00AFD9F0',
    getListRootRva: '0x005E3470',
    getListHelperRva: '0x005E35D0',
    getCategoryCountRva: '0x004C0570',
    songItemSize: '0xA0',
    evidence: '2026-08-14 从当前安装构建恢复静态调用链并通过全部只读门禁'
  })
});
