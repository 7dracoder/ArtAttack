import { GamePhase, RoomData } from '../types';

export function getGamePhase(status: RoomData['status']): GamePhase {
  switch (status) {
    case 'WAITING':
      return 'LOBBY';
    case 'DRAWING':
      return 'DRAWING';
    case 'ANALYZING':
    case 'SPRITE_GEN':
      return 'ANALYZING';
    case 'INTRO':
      return 'INTRO';
    case 'FIGHT':
    case 'FINISHED':
      return 'FIGHT';
  }
}
