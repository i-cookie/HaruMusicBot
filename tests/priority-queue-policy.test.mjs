import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendToNormalQueue,
  appendToPriorityQueue,
  combinedQueueAheadCount,
  prependToNormalQueue,
  prependToPriorityQueue,
  reorderWithinQueuePartition
} from '../electron/priority-queue-policy.ts';

test('later priority requests append after earlier priority requests and before normal requests', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' }
  ];

  appendToPriorityQueue(queue, { id: 'priority-2' });

  assert.deepEqual(queue.map(song => song.id), [
    'priority-1',
    'priority-2',
    'normal-1'
  ]);
  assert.equal(combinedQueueAheadCount(queue, queue[1]), 1);
  assert.equal(combinedQueueAheadCount(queue, queue[2]), 2);
});

test('manual priority head remains ahead of the priority FIFO queue', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' }
  ];

  prependToPriorityQueue(queue, { id: 'manual-top' });
  appendToNormalQueue(queue, { id: 'normal-2' });

  assert.deepEqual(queue.map(song => song.id), [
    'manual-top',
    'priority-1',
    'normal-1',
    'normal-2'
  ]);
});

test('manual top promotes a normal song to the head of the priority queue', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' },
    { id: 'normal-2', QueuePriority: 'normal' }
  ];
  const selected = queue.splice(2, 1)[0];

  prependToPriorityQueue(queue, selected);

  assert.deepEqual(queue.map(song => song.id), [
    'normal-2',
    'priority-1',
    'normal-1'
  ]);
  assert.equal(queue[0].QueuePriority, 'priority');
});

test('manual top moves an existing priority song to priority head', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'priority-2', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' }
  ];
  const selected = queue.splice(1, 1)[0];

  prependToPriorityQueue(queue, selected);

  assert.deepEqual(queue.map(song => song.id), [
    'priority-2',
    'priority-1',
    'normal-1'
  ]);
});

test('returned priority song goes to the head of its priority queue', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' }
  ];

  prependToPriorityQueue(queue, { id: 'returned-priority', QueuePriority: 'priority' });

  assert.deepEqual(queue.map(song => song.id), [
    'returned-priority',
    'priority-1',
    'normal-1'
  ]);
});

test('returned normal song goes to the normal queue head after every priority song', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'priority-2', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' }
  ];

  prependToNormalQueue(queue, { id: 'returned-normal', QueuePriority: 'normal' });

  assert.deepEqual(queue.map(song => song.id), [
    'priority-1',
    'priority-2',
    'returned-normal',
    'normal-1'
  ]);
});

test('drag reorder stays within the songs queue partition', () => {
  const queue = [
    { id: 'priority-1', QueuePriority: 'priority' },
    { id: 'priority-2', QueuePriority: 'priority' },
    { id: 'normal-1', QueuePriority: 'normal' },
    { id: 'normal-2', QueuePriority: 'normal' }
  ];

  reorderWithinQueuePartition(queue, 3, 0);
  assert.deepEqual(queue.map(song => song.id), [
    'priority-1',
    'priority-2',
    'normal-2',
    'normal-1'
  ]);
});
