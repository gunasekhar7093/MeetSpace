import { body } from 'express-validator';
import { MEETING_ID_REGEX } from '../utils/meetingId.utils.js';

export const livekitTokenValidator = [
  body('meetingId')
    .exists({ checkFalsy: true })
    .withMessage('Meeting ID is required.')
    .bail()
    .isString()
    .withMessage('Meeting ID must be a string.')
    .bail()
    .trim()
    .toLowerCase()
    .matches(MEETING_ID_REGEX)
    .withMessage('Invalid Meeting ID format. Expected format: xxx-xxxx-xxx.'),
];

