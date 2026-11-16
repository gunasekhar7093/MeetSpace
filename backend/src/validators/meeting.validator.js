import { body, param, query } from 'express-validator';
import { MEETING_ID_REGEX } from '../utils/meetingId.utils.js';

const FORBIDDEN_CREATE_FIELDS = ['meetingId', 'host', 'status', 'startedAt', 'endedAt'];
const FORBIDDEN_UPDATE_FIELDS = [
  'meetingId',
  'host',
  'status',
  'startedAt',
  'endedAt',
  'isInstant',
];

function validateNoForbiddenFields(forbiddenFields) {
  return body().custom((value) => {
    if (!value || typeof value !== 'object') return true;
    const present = forbiddenFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(value, field)
    );
    if (present.length > 0) {
      throw new Error(`Forbidden field(s) cannot be set directly: ${present.join(', ')}.`);
    }
    return true;
  });
}

function validateSettingsFields() {
  return [
    body('settings')
      .optional()
      .isObject({ strict: true })
      .withMessage('Settings must be an object.'),
    body('settings.waitingRoomEnabled')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('waitingRoomEnabled must be a boolean.'),
    body('settings.chatEnabled')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('chatEnabled must be a boolean.'),
    body('settings.screenShareEnabled')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('screenShareEnabled must be a boolean.'),
    body('settings.allowParticipantScreenShare')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('allowParticipantScreenShare must be a boolean.'),
    body('settings.participantLimit')
      .optional()
      .isInt({ min: 2, max: 500 })
      .withMessage('participantLimit must be an integer between 2 and 500.'),
  ];
}

export const meetingIdParamValidator = [
  param('meetingId')
    .trim()
    .toLowerCase()
    .matches(MEETING_ID_REGEX)
    .withMessage('Invalid Meeting ID format. Expected format: xxx-xxxx-xxx.'),
];

export const createMeetingValidator = [
  validateNoForbiddenFields(FORBIDDEN_CREATE_FIELDS),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Meeting title is required.')
    .isLength({ min: 2, max: 120 })
    .withMessage('Meeting title must be between 2 and 120 characters.'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters.'),
  body('isInstant')
    .optional()
    .isBoolean({ strict: true })
    .withMessage('isInstant must be a boolean.'),
  body('scheduledAt')
    .if((_val, { req }) => req.body?.isInstant !== true)
    .notEmpty()
    .withMessage('scheduledAt is required for scheduled meetings.')
    .isISO8601()
    .withMessage('scheduledAt must be a valid ISO 8601 date string.')
    .custom((value) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('scheduledAt is invalid.');
      }
      if (parsed.getTime() < Date.now() - 60 * 1000) {
        throw new Error('scheduledAt must be in the future.');
      }
      return true;
    }),
  ...validateSettingsFields(),
];

export const updateMeetingValidator = [
  ...meetingIdParamValidator,
  validateNoForbiddenFields(FORBIDDEN_UPDATE_FIELDS),
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Meeting title cannot be empty.')
    .isLength({ min: 2, max: 120 })
    .withMessage('Meeting title must be between 2 and 120 characters.'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string.')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters.'),
  body('scheduledAt')
    .optional()
    .isISO8601()
    .withMessage('scheduledAt must be a valid ISO 8601 date string.')
    .custom((value) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < Date.now() - 60 * 1000) {
        throw new Error('scheduledAt must be a valid future date.');
      }
      return true;
    }),
  ...validateSettingsFields(),
];

export const listMeetingsValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50.'),
  query('status')
    .optional()
    .isIn(['scheduled', 'active', 'ended', 'cancelled'])
    .withMessage('status must be one of: scheduled, active, ended, cancelled.'),
  query('filter')
    .optional()
    .isIn(['all', 'hosted', 'joined', 'upcoming'])
    .withMessage('filter must be one of: all, hosted, joined, upcoming.'),
  query('sortBy')
    .optional()
    .isIn(['scheduledAt', 'createdAt'])
    .withMessage('sortBy must be scheduledAt or createdAt.'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be asc or desc.'),
];

export const meetingHistoryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50.'),
  query('role')
    .optional()
    .isIn(['all', 'hosted', 'attended'])
    .withMessage('role must be one of: all, hosted, attended.'),
  query('status')
    .optional()
    .isIn(['ended', 'cancelled'])
    .withMessage('status must be ended or cancelled.'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 120 })
    .withMessage('search cannot exceed 120 characters.'),
  query('sortBy')
    .optional()
    .isIn(['endedAt', 'startedAt', 'createdAt'])
    .withMessage('sortBy must be endedAt, startedAt, or createdAt.'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be asc or desc.'),
];

