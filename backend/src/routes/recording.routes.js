import { Router } from 'express';
import * as recordingController from '../controllers/recording.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { recordingLimiter } from '../middleware/rateLimit.middleware.js';
import {
  meetingIdParamValidator,
  recordingIdParamValidator,
  startRecordingValidator,
} from '../validators/recording.validator.js';

const router = Router({ mergeParams: true });

// All recording routes require user authentication
router.use(authenticate);

// Start recording (host only)
router.post(
  '/start',
  recordingLimiter,
  startRecordingValidator,
  validateRequest,
  recordingController.startRecording
);

// Stop recording (host only)
router.post(
  '/stop',
  recordingLimiter,
  meetingIdParamValidator,
  validateRequest,
  recordingController.stopRecording
);

// List recordings for meeting (host or participant)
router.get(
  '/',
  meetingIdParamValidator,
  validateRequest,
  recordingController.listRecordings
);

// Get recording details (host or participant)
router.get(
  '/:recordingId',
  recordingIdParamValidator,
  validateRequest,
  recordingController.getRecording
);

// Stream recording video (HTTP 206 Range supported)
router.get(
  '/:recordingId/stream',
  recordingIdParamValidator,
  validateRequest,
  recordingController.streamRecordingFile
);

// Download recording MP4
router.get(
  '/:recordingId/download',
  recordingIdParamValidator,
  validateRequest,
  recordingController.downloadRecordingFile
);

export default router;

