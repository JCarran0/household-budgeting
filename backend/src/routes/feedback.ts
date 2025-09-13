import { Router, Request, Response } from 'express';
import { feedbackService } from '../services/feedbackService';
import { authenticate, validateBody, rateLimitAuth } from '../middleware/authMiddleware';
import { feedbackSchema } from '../validators/feedbackValidators';
import type { FeedbackSubmission } from '../../../shared/types';

const router = Router();

/**
 * @route POST /api/v1/feedback/submit
 * @desc Submit feedback (bug report or feature request)
 * @access Private (requires authentication)
 */
router.post(
  '/submit',
  authenticate,
  rateLimitAuth, // Apply rate limiting to prevent spam
  validateBody(feedbackSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const feedbackData = req.body as FeedbackSubmission;

      // Add user context to application state if provided
      if (feedbackData.applicationState && req.user) {
        feedbackData.applicationState.username = req.user.username;
      }

      // Submit feedback via GitHub API
      const result = await feedbackService.submitFeedback(feedbackData);

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Feedback submitted successfully',
          issueUrl: result.issueUrl,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to submit feedback',
        });
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * @route GET /api/v1/feedback/test
 * @desc Test GitHub API connection (admin only)
 * @access Private
 */
router.get(
  '/test',
  authenticate,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await feedbackService.testConnection();

      res.json({
        success: result.success,
        message: result.success
          ? 'GitHub API connection successful'
          : 'GitHub API connection failed',
        error: result.error,
      });
    } catch (error) {
      console.error('GitHub test error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test GitHub connection',
      });
    }
  }
);

export default router;