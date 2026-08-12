import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planImmediatePlaybackCommand,
  planObservedNextAction,
  planQueueHeadMutation,
  getNextGuardMode,
  isLikelyManualTrackSelection,
  queueSongIdentity,
  shouldDeferManagedTrackObservation,
  shouldPreserveQueueDuringManagedReplay,
  shouldPreserveGuardAfterImmediate,
  shouldPreserveExternalTrackSelection,
  shouldRepairObservedNext,
  tracksHaveDifferentStableIds,
  tracksRepresentSameSong
} from '../electron/queue-head-policy.ts';

const song = id => queueSongIdentity(
  { Id: id, SongName: `Song ${id}`, PlayerKey: 'netease' },
  'netease'
);

test('first local queue head is inserted exactly once', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: '',
    nextHeadIdentity: song('A'),
    hadRegisteredNext: false,
    isPlaying: true
  }), 'insert');
});

test('appending later songs does not touch the native queue head', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: song('A'),
    nextHeadIdentity: song('A'),
    hadRegisteredNext: true,
    isPlaying: true
  }), 'none');
});

test('changing a registered head only replaces the fallback guard', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: song('A'),
    nextHeadIdentity: song('B'),
    hadRegisteredNext: true,
    isPlaying: true
  }), 'arm-only');
});

test('removing the final registered head marks its native copy for skipping', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: song('A'),
    nextHeadIdentity: '',
    hadRegisteredNext: true,
    isPlaying: true
  }), 'cancel-native');
});

test('paused ordering never inserts into a player queue', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: '',
    nextHeadIdentity: song('A'),
    hadRegisteredNext: false,
    isPlaying: false
  }), 'none');
});

test('changing an already inserted head while paused only retargets its guard', () => {
  assert.equal(planQueueHeadMutation({
    previousHeadIdentity: song('A'),
    nextHeadIdentity: song('B'),
    hadRegisteredNext: true,
    isPlaying: false
  }), 'arm-only');
});

test('observed fallback ID still matches the numeric queue item metadata', () => {
  assert.equal(tracksRepresentSameSong(
    {
      Id: '3404096928',
      SongName: 'WannaCry',
      ArtistName: 'Ninajirachi / Porter Robinson'
    },
    {
      id: 'WannaCry|Ninajirachi、Porter Robinson',
      title: 'WannaCry',
      artist: 'Ninajirachi、Porter Robinson'
    }
  ), true);
});

test('different stable IDs are an authoritative track transition', () => {
  assert.equal(tracksHaveDifferentStableIds(
    { id: '1839140774', title: 'Musician', artist: 'Porter Robinson' },
    { id: '3404096928', title: 'Musician', artist: 'Porter Robinson' }
  ), true);
});

test('title fallback becoming a stable ID is metadata enrichment, not a transition', () => {
  assert.equal(tracksHaveDifferentStableIds(
    { id: 'Musician|Porter Robinson', title: 'Musician', artist: 'Porter Robinson' },
    { id: '1839140774', title: 'Musician', artist: 'Porter Robinson' }
  ), false);
});

test('same title from a different artist is not treated as the queue head', () => {
  assert.equal(tracksRepresentSameSong(
    { Id: '1', SongName: 'Home', ArtistName: 'Artist A' },
    { id: 'Home|Artist B', title: 'Home', artist: 'Artist B' }
  ), false);
});

test('different stable IDs stay different even when metadata is identical', () => {
  assert.equal(tracksRepresentSameSong(
    { Id: '111', SongName: 'Same', ArtistName: 'Artist' },
    { id: '222', title: 'Same', artist: 'Artist' }
  ), false);
});

test('exact platform ID remains authoritative when metadata is incomplete', () => {
  assert.equal(tracksRepresentSameSong(
    { Id: '218338', SongName: '开不了口', ArtistName: '周杰伦' },
    { id: '218338', title: '', artist: '' }
  ), true);
});

test('real next-track observation suppresses duplicate insertion', () => {
  const expected = {
    Id: '3404096928',
    SongName: 'WannaCry',
    ArtistName: 'Ninajirachi/Porter Robinson'
  };
  assert.equal(shouldRepairObservedNext(expected, {
    id: '3404096928',
    title: 'WannaCry',
    artist: 'Ninajirachi/Porter Robinson'
  }), false);
});

test('missing or mismatched next-track observation requests repair', () => {
  const expected = {
    Id: '3404096928',
    SongName: 'WannaCry',
    ArtistName: 'Ninajirachi/Porter Robinson'
  };
  assert.equal(shouldRepairObservedNext(expected, null), true);
  assert.equal(shouldRepairObservedNext(expected, {
    id: 'other',
    title: 'Shelter',
    artist: 'Porter Robinson/Madeon'
  }), true);
});

test('unknown QQ next-track state never requests a speculative reinsert', () => {
  const expected = {
    Id: '3404096928',
    SongName: 'WannaCry',
    ArtistName: 'Ninajirachi/Porter Robinson'
  };

  assert.equal(
    shouldRepairObservedNext(expected, null, 'unknown'),
    false
  );
  assert.equal(
    shouldRepairObservedNext(expected, null, 'empty'),
    true
  );
});

test('normal A followed by immediate B only rearms preserved A', () => {
  const shelter = {
    Id: '201423402',
    SongName: 'Shelter',
    ArtistName: 'Porter Robinson/Madeon'
  };

  assert.equal(planObservedNextAction({
    expected: shelter,
    observedNext: null,
    nextObservation: 'unknown',
    preserveInsertedHead: true,
    expectedAlreadyGuarded: false
  }), 'arm-only');
});

test('unknown QQ next does not reinsert an already guarded queue head', () => {
  const shelter = {
    Id: '201423402',
    SongName: 'Shelter',
    ArtistName: 'Porter Robinson/Madeon'
  };

  assert.equal(planObservedNextAction({
    expected: shelter,
    observedNext: null,
    nextObservation: 'unknown',
    preserveInsertedHead: false,
    expectedAlreadyGuarded: true
  }), 'none');
});

test('unknown QQ next inserts a newly advanced unguarded queue head once', () => {
  assert.equal(planObservedNextAction({
    expected: {
      Id: 'next-b',
      SongName: 'Next B',
      ArtistName: 'Artist'
    },
    observedNext: null,
    nextObservation: 'unknown',
    preserveInsertedHead: false,
    expectedAlreadyGuarded: false
  }), 'insert');
});

test('confirmed mismatched next still requests native repair', () => {
  assert.equal(planObservedNextAction({
    expected: {
      Id: '201423402',
      SongName: 'Shelter',
      ArtistName: 'Porter Robinson/Madeon'
    },
    observedNext: {
      id: '80605719',
      title: 'Mirror',
      artist: 'Porter Robinson'
    },
    nextObservation: 'track',
    preserveInsertedHead: false,
    expectedAlreadyGuarded: false
  }), 'insert');
});

test('QQ interrupt uses the preserve-current native transaction', () => {
  assert.equal(planImmediatePlaybackCommand({
    playerKey: 'qqmusic',
    mode: 'interrupt',
    hasCurrentSong: true
  }), 'InterruptSelected');
  assert.equal(planImmediatePlaybackCommand({
    playerKey: 'qqmusic',
    mode: 'play-now',
    hasCurrentSong: true
  }), 'PlaySelected');
  assert.equal(planImmediatePlaybackCommand({
    playerKey: 'kugou',
    mode: 'interrupt',
    hasCurrentSong: true
  }), 'PlaySelected');
});

test('managed previous-track transition is deferred until the final target', () => {
  const mirror = {
    Id: '80605719',
    SongName: 'Mirror',
    ArtistName: 'Porter Robinson'
  };
  assert.equal(shouldDeferManagedTrackObservation(mirror, {
    id: 'previous-native-song',
    title: 'Previous native song',
    artist: 'Artist'
  }), true);
  assert.equal(shouldDeferManagedTrackObservation(mirror, {
    id: '80605719',
    title: 'Mirror',
    artist: 'Porter Robinson'
  }), false);
});

test('managed replay never consumes a duplicate queued request for the same song', () => {
  const playingRequest = {
    QueueEntryId: 'playing-request',
    Id: '80605719',
    SongName: 'Mirror',
    ArtistName: 'Porter Robinson',
    OrderedByUid: 'same-user'
  };
  const duplicateQueuedRequest = {
    ...playingRequest,
    QueueEntryId: 'queued-request'
  };

  assert.equal(shouldPreserveQueueDuringManagedReplay(
    'replay',
    playingRequest,
    duplicateQueuedRequest
  ), true);
  assert.notEqual(
    playingRequest.QueueEntryId,
    duplicateQueuedRequest.QueueEntryId
  );
  assert.equal(shouldPreserveQueueDuringManagedReplay(
    'play-now',
    playingRequest,
    duplicateQueuedRequest
  ), false);
});

test('selecting a track other than the previously reported native next is manual', () => {
  assert.equal(isLikelyManualTrackSelection({
    observed: { id: 'manual', title: 'Manual Song' },
    previousNativeNext: { id: 'natural', title: 'Natural Next' },
    previousNextObservation: 'track'
  }), true);
});

test('advancing into the previously reported native next is natural', () => {
  assert.equal(isLikelyManualTrackSelection({
    observed: { id: 'natural', title: 'Natural Next' },
    previousNativeNext: { id: 'natural', title: 'Natural Next' },
    previousNextObservation: 'track'
  }), false);
});

test('a new track after a confirmed empty next is treated as manual', () => {
  assert.equal(isLikelyManualTrackSelection({
    observed: { id: 'manual', title: 'Manual Song' },
    previousNativeNext: null,
    previousNextObservation: 'empty'
  }), true);
});

test('unknown legacy next state keeps the conservative fallback behavior', () => {
  assert.equal(isLikelyManualTrackSelection({
    observed: { id: 'new', title: 'New Song' },
    previousNativeNext: null,
    previousNextObservation: 'unknown'
  }), false);
});

test('NetEase preserves an off-queue player selection even without next metadata', () => {
  assert.equal(shouldPreserveExternalTrackSelection({
    playerKey: 'netease',
    managedActionActive: false,
    observed: { id: 'manual', title: 'Manual Song' },
    currentRequest: { Id: 'request-current', SongName: 'Request Current' },
    queueHead: { Id: 'request-next', SongName: 'Request Next' },
    likelyManualSelection: false,
    previousNextObservation: 'unknown'
  }), true);
});

test('NetEase natural transition to its previously observed next is not preserved', () => {
  assert.equal(shouldPreserveExternalTrackSelection({
    playerKey: 'netease',
    managedActionActive: false,
    observed: { id: 'native-next', title: 'Native Next' },
    currentRequest: { Id: 'request-current', SongName: 'Request Current' },
    queueHead: { Id: 'request-next', SongName: 'Request Next' },
    likelyManualSelection: false,
    previousNextObservation: 'track'
  }), false);
});

test('NetEase still advances normally when the observed song is the queue head', () => {
  const queueHead = { Id: 'request-next', SongName: 'Request Next' };
  assert.equal(shouldPreserveExternalTrackSelection({
    playerKey: 'netease',
    managedActionActive: false,
    observed: { id: 'request-next', title: 'Request Next' },
    currentRequest: { Id: 'request-current', SongName: 'Request Current' },
    queueHead,
    likelyManualSelection: false,
    previousNextObservation: 'track'
  }), false);
});

test('managed player actions are never reclassified as external selections', () => {
  assert.equal(shouldPreserveExternalTrackSelection({
    playerKey: 'netease',
    managedActionActive: true,
    observed: { id: 'intermediate', title: 'Intermediate' },
    currentRequest: null,
    queueHead: { Id: 'request-next', SongName: 'Request Next' },
    likelyManualSelection: true,
    previousNextObservation: 'track'
  }), false);
});

test('NetEase uses passive queue guarding so player-side selections stay observable', () => {
  assert.equal(getNextGuardMode('netease'), 'passive');
  assert.equal(getNextGuardMode('kugou'), 'active');
  assert.equal(getNextGuardMode('qqmusic'), 'active');
});

test('QQ interrupt always preserves the displaced current song as guard', () => {
  assert.equal(shouldPreserveGuardAfterImmediate({
    command: 'InterruptSelected',
    hadRegisteredGuard: false,
    hasDisplacedCurrentSong: true
  }), true);
  assert.equal(shouldPreserveGuardAfterImmediate({
    command: 'PlaySelected',
    hadRegisteredGuard: false,
    hasDisplacedCurrentSong: true
  }), false);
});
