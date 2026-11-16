import { Router } from 'express';
import * as meetingController from '../controllers/meeting.controller.js';
import recordingRoutes from './recording.routes.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import {
  meetingCreationLimiter,
  meetingJoinLimiter,
} from '../middleware/rateLimit.middleware.js';
import {
  createMeetingValidator,
  listMeetingsValidator,
  meetingHistoryValidator,
  meetingIdParamValidator,
  updateMeetingValidator,
} from '../validators/meeting.validator.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  meetingCreationLimiter,
  createMeetingValidator,
  validateRequest,
  meetingController.createMeeting
);
router.get('/', listMeetingsValidator, validateRequest, meetingController.listMeetings);
router.get(
  '/history',
  meetingHistoryValidator,
  validateRequest,
  meetingController.getMeetingHistory
);

router.get(
  '/:meetingId',
  meetingIdParamValidator,
  validateRequest,
  meetingController.getMeetingDetails
);
router.patch(
  '/:meetingId',
  updateMeetingValidator,
  validateRequest,
  meetingController.updateMeeting
);
router.delete(
  '/:meetingId',
  meetingIdParamValidator,
  validateRequest,
  meetingController.cancelMeeting
);

router.post(
  '/:meetingId/join',
  meetingJoinLimiter,
  meetingIdParamValidator,
  validateRequest,
  meetingController.joinMeeting
);
router.post(
  '/:meetingId/leave',
  meetingIdParamValidator,
  validateRequest,
  meetingController.leaveMeeting
);
router.post(
  '/:meetingId/end',
  meetingIdParamValidator,
  validateRequest,
  meetingController.endMeeting
);

// Mount meeting recording routes
router.use('/:meetingId/recordings', recordingRoutes);

export default router;

