import { param, body } from 'express-validator';
import { MEETING_ID_REGEX } from '../utils/meetingId.utils.js';

export const meetingIdParamValidator = [
  param('meetingId')
    .trim()
    .toLowerCase()
    .matches(MEETING_ID_REGEX)
    .withMessage('Invalid Meeting ID format. Expected format: xxx-xxxx-xxx.'),
];

export const recordingIdParamValidator = [
  ...meetingIdParamValidator,
  param('recordingId')
    .trim()
    .notEmpty()
    .withMessage('Recording ID is required.')
    .matches(/^rec-[a-z0-9_-]+$/i)
    .withMessage('Invalid Recording ID format.'),
];

export const startRecordingValidator = [
  ...meetingIdParamValidator,
  body('layout')
    .optional()
    .trim()
    .isIn(['grid', 'speaker', 'single-speaker'])
    .withMessage('Layout must be one of: grid, speaker, single-speaker.'),
];

