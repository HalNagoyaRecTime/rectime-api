import { Context } from 'hono';
import { IEntryService } from '../../application/services/IEntryService';

export function createEntryController(entryService: IEntryService) {
  const getAllEntries = async (c: Context) => {
    try {
      const entries = await entryService.getAllEntries({});
      return c.json(entries);
    } catch (error) {
      console.error(error);
      return c.json({ error: 'Failed to fetch entries' }, 500);
    }
  };

  const getEntryById = async (c: Context) => {
    try {
      const entryIdParam = c.req.param('entryId');
      const id = Number(entryIdParam);

      if (!entryIdParam || Number.isNaN(id)) {
        return c.json({ error: 'Invalid entry ID' }, 400);
      }

      const entry = await entryService.getEntryById(id);
      return c.json(entry);
    } catch (error) {
      if (error instanceof Error && error.message === 'Entry not found') {
        return c.json({ error: 'Entry not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch entry' }, 500);
    }
  };

  return {
    getAllEntries,
    getEntryById,
  };
}
