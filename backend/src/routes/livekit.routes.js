import { Router } from 'express';
import * as livekitController from '../controllers/livekit.controller.js';
import * as recordingController from '../controllers/recording.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { livekitTokenValidator } from '../validators/livekit.validator.js';

const router = Router();

// Protected token generation route (requires MeetSpace JWT auth)
router.post(
  '/token',
  authenticate,
  livekitTokenValidator,
  validateRequest,
  livekitController.getLiveKitToken
);

// Public webhook receiver route (cryptographically verified via LiveKit HMAC header)
router.post(
  '/webhooks',
  recordingController.handleLiveKitWebhook
);

export default router;
