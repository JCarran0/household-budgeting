import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { UnifiedDataService } from '../services/dataService';
import { z } from 'zod';

const router = Router();
const dataService = new UnifiedDataService();

// Zod schema for theme preference validation
// Allows any partial color palette structure with hex color strings
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color');

const colorTuplePartial = z.array(hexColor).max(10).optional();

const themePreferencesSchema = z.object({
  colors: z.record(z.string(), colorTuplePartial).optional(),
  primaryColor: z.string().max(50).optional(),
  chart: z.object({
    series: z.array(hexColor).max(20).optional(),
    income: hexColor.optional(),
    expense: hexColor.optional(),
    budgeted: hexColor.optional(),
    priorYear: hexColor.optional(),
    average: hexColor.optional(),
    plannedSpending: hexColor.optional(),
    actualSpending: hexColor.optional(),
    barFill: hexColor.optional(),
  }).optional(),
  gradients: z.object({
    primaryButton: z.object({
      from: z.string().max(50).optional(),
      to: z.string().max(50).optional(),
    }).optional(),
  }).optional(),
  debug: z.object({
    background: hexColor.optional(),
    border: hexColor.optional(),
  }).optional(),
}).strict();

function storageKey(userId: string): string {
  return `theme_preferences_${userId}`;
}

/**
 * @route GET /api/v1/themes/preferences
 * @desc Get saved theme preferences for the authenticated user
 * @access Private
 */
router.get('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const prefs = await dataService.getData<Record<string, unknown>>(storageKey(userId));
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    console.error('Error fetching theme preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch theme preferences' });
  }
});

/**
 * @route PUT /api/v1/themes/preferences
 * @desc Save theme preferences (overrides only) for the authenticated user
 * @access Private
 */
router.put('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = themePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid theme preferences',
        details: parsed.error.issues,
      });
      return;
    }

    const userId = req.user!.userId;
    await dataService.saveData(storageKey(userId), parsed.data);
    res.json({ success: true, message: 'Theme preferences saved' });
  } catch (error) {
    console.error('Error saving theme preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to save theme preferences' });
  }
});

/**
 * @route DELETE /api/v1/themes/preferences
 * @desc Reset theme preferences to defaults (deletes stored prefs)
 * @access Private
 */
router.delete('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    await dataService.deleteData(storageKey(userId));
    res.json({ success: true, message: 'Theme preferences reset to defaults' });
  } catch (error) {
    console.error('Error resetting theme preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to reset theme preferences' });
  }
});

export default router;
