import { Context } from 'hono';
import { IClassRoomService } from '../../application/services/IClassRoomService';

export function createClassRoomController(classService: IClassRoomService) {
  const putAllClassRooms = async (c: Context) => {
    try {
      const classRooms = await classService.putAllClassRooms();
      return c.json(classRooms);
    } catch (error) {
      console.error('Error fetching class rooms:', error);
      return c.json({ error: 'Failed to fetch class rooms' }, 500);
    }
  };

  return {
    putAllClassRooms,
  };
}
