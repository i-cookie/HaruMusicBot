export interface QueuePrioritySong {
  QueuePriority?: 'priority' | 'normal';
  IsPriorityRequest?: boolean;
  IsSuperChat?: boolean;
}

export function isPriorityQueueSong(song: QueuePrioritySong | null | undefined): boolean {
  return song?.QueuePriority === 'priority'
    || song?.IsPriorityRequest === true
    || song?.IsSuperChat === true;
}

export function priorityQueueLength(queue: QueuePrioritySong[]): number {
  return queue.reduce((count, song) => count + (isPriorityQueueSong(song) ? 1 : 0), 0);
}

export function combinedQueueAheadCount<T>(queue: T[], song: T): number {
  const index = queue.indexOf(song);
  return index >= 0 ? index : 0;
}

export function appendToPriorityQueue<T extends QueuePrioritySong>(queue: T[], song: T): number {
  song.QueuePriority = 'priority';
  song.IsPriorityRequest = true;
  const insertionIndex = priorityQueueLength(queue);
  queue.splice(insertionIndex, 0, song);
  return insertionIndex;
}

export function prependToPriorityQueue<T extends QueuePrioritySong>(queue: T[], song: T): number {
  song.QueuePriority = 'priority';
  song.IsPriorityRequest = true;
  queue.unshift(song);
  return 0;
}

export function prependToNormalQueue<T extends QueuePrioritySong>(queue: T[], song: T): number {
  song.QueuePriority = 'normal';
  song.IsPriorityRequest = false;
  const insertionIndex = priorityQueueLength(queue);
  queue.splice(insertionIndex, 0, song);
  return insertionIndex;
}

export function appendToNormalQueue<T extends QueuePrioritySong>(queue: T[], song: T): number {
  song.QueuePriority = 'normal';
  song.IsPriorityRequest = false;
  queue.push(song);
  return queue.length - 1;
}

export function reorderWithinQueuePartition<T extends QueuePrioritySong>(
  queue: T[],
  from: number,
  requestedTo: number
): number {
  if (from < 0 || from >= queue.length) return from;
  const item = queue.splice(from, 1)[0];
  if (!item) return from;

  const priorityCount = priorityQueueLength(queue);
  const target = isPriorityQueueSong(item)
    ? Math.min(priorityCount, Math.max(0, requestedTo))
    : Math.min(queue.length, Math.max(priorityCount, requestedTo));
  queue.splice(target, 0, item);
  return target;
}
