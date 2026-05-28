import { Context } from 'hono';
import { EntryControllerFunctions } from '../types/controllers';
import { EntryServiceFunctions } from '../types/services';

export function createEntryController(
  entryService: EntryServiceFunctions
): EntryControllerFunctions {
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
      const entryId = c.req.param('entryId');
      if (!entryId) {
        return c.json({ error: 'Entry id is required' }, 400);
      }
      const id = parseInt(entryId);
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
