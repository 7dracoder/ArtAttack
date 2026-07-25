import { RoomData } from '../types';

export function matchesFinishedRound(
  room: RoomData,
  expectedStartedAt?: number
): boolean {
  return Boolean(
    room.status === 'FINISHED' &&
      room.fightState?.winner &&
      (expectedStartedAt === undefined || room.fightState.startedAt === expectedStartedAt)
  );
}

export function matchesFinishedOrResetRound(
  room: RoomData,
  expectedStartedAt?: number
): boolean {
  if (matchesFinishedRound(room, expectedStartedAt)) return true;
  if (expectedStartedAt === undefined) return false;

  return (
    (room.status === 'WAITING' || room.status === 'DRAWING') &&
    room.lastCompletedStartedAt === expectedStartedAt
  );
}
