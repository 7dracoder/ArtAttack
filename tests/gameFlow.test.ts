import assert from 'node:assert/strict';
import test from 'node:test';
import { parseImageDataUrl } from '../src/lib/dataUrl';
import { buildPlayerStateSyncUpdates } from '../src/lib/fightState';
import { getGamePhase } from '../src/lib/gameFlow';
import { PlayerFightState } from '../src/types';

test('room statuses drive every client through the full match flow', () => {
  assert.equal(getGamePhase('WAITING'), 'LOBBY');
  assert.equal(getGamePhase('DRAWING'), 'DRAWING');
  assert.equal(getGamePhase('ANALYZING'), 'ANALYZING');
  assert.equal(getGamePhase('SPRITE_GEN'), 'ANALYZING');
  assert.equal(getGamePhase('INTRO'), 'INTRO');
  assert.equal(getGamePhase('FIGHT'), 'FIGHT');
  assert.equal(getGamePhase('FINISHED'), 'FIGHT');
});

test('movement sync never writes authoritative HP back to Firestore', () => {
  const state: PlayerFightState = {
    x: 120,
    y: 320,
    vx: 2,
    vy: 0,
    hp: 37,
    facingLeft: false,
    isGrounded: true,
    isAttacking: false,
    isBlocking: false,
    currentAction: null,
    cooldowns: {},
    updatedAt: 1234,
  };

  const updates = buildPlayerStateSyncUpdates('player1', state, 5678);

  assert.equal(updates['fightState.player1.x'], 120);
  assert.equal(updates['fightState.player1.updatedAt'], 1234);
  assert.equal(updates.updatedAt, 5678);
  assert.equal('fightState.player1.hp' in updates, false);
  assert.equal('fightState.player2.x' in updates, false);
});

test('movement sync normalizes optional runtime controls for Firestore', () => {
  const state = {
    x: 120,
    y: 320,
    vx: 0,
    vy: 0,
    hp: 100,
    facingLeft: false,
    isGrounded: true,
    isAttacking: false,
    isBlocking: undefined,
    currentAction: undefined,
    cooldowns: undefined,
    updatedAt: 1234,
  } as unknown as PlayerFightState;

  const updates = buildPlayerStateSyncUpdates('player2', state);

  assert.equal(updates['fightState.player2.isBlocking'], false);
  assert.equal(updates['fightState.player2.currentAction'], null);
  assert.deepEqual(updates['fightState.player2.cooldowns'], {});
  assert.equal(Object.values(updates).includes(undefined), false);
});

test('WebP drawings retain their MIME type when sent to Gemini', () => {
  assert.deepEqual(parseImageDataUrl('data:image/webp;base64,UklGRg=='), {
    mimeType: 'image/webp',
    data: 'UklGRg==',
  });
  assert.deepEqual(parseImageDataUrl('raw-png-base64'), {
    mimeType: 'image/png',
    data: 'raw-png-base64',
  });
});
