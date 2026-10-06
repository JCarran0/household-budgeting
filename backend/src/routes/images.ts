/**
 * Image Routes — read-only serving of stored images (see imageStore.ts).
 *
 * GET /api/v1/images/:imageId
 *
 * Generic on purpose: any owner (wishlist, later tasks) hands the client an
 * `ImageRef.id`, and this is where the bytes come from. Upload and delete are
 * NOT here — they belong to each owner's routes, so an image is only ever
 * created already attached to something.
 *
 * Authorization is the family: the lookup is scoped to the caller's familyId,
 * so another household's id is a 404, indistinguishable from a missing one.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { imageStore } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError, NotFoundError } from '../errors';

const router = Router();

router.use(authMiddleware);

router.get('/:imageId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const image = await imageStore.get(familyId, req.params.imageId);
    if (!image) throw new NotFoundError('Image not found');

    res.set({
      'Content-Type': image.mimeType,
      // Ids are immutable (a replaced image gets a new id), so the bytes for
      // an id never change. `private` keeps shared caches out of it.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    });
    res.send(image.body);
  } catch (error) {
    next(error);
  }
});

export default router;
