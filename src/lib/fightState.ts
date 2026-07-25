import { PlayerFightState, PlayerId } from '../types';

export function buildPlayerStateSyncUpdates(
  playerId: PlayerId,
  state: PlayerFightState,
  roomUpdatedAt = Date.now()
): Record<string, unknown> {
  const statePath = `fightState.${playerId}`;
  const updates: Record<string, unknown> = {
    [`${statePath}.x`]: state.x,
    [`${statePath}.y`]: state.y,
    [`${statePath}.vx`]: state.vx,
    [`${statePath}.vy`]: state.vy,
    [`${statePath}.facingLeft`]: Boolean(state.facingLeft),
    [`${statePath}.isGrounded`]: Boolean(state.isGrounded),
    [`${statePath}.isAttacking`]: Boolean(state.isAttacking),
    [`${statePath}.isBlocking`]: Boolean(state.isBlocking),
    [`${statePath}.currentAction`]: state.currentAction ?? null,
    [`${statePath}.cooldowns`]: state.cooldowns ?? {},
    [`${statePath}.updatedAt`]: state.updatedAt,
    updatedAt: roomUpdatedAt,
  };

  if (state.lastHitBy !== undefined) {
    updates[`${statePath}.lastHitBy`] = state.lastHitBy;
  }

  return updates;
}
