import { body, cookie } from 'express-validator';
import { REFRESH_COOKIE_NAME } from '../utils/token.utils.js';

export const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters.'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail({
      all_lowercase: true,
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
    }),
  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter.')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number.'),
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail({
      all_lowercase: true,
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
    }),
  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isString()
    .withMessage('Password must be a string.'),
];

export const refreshValidator = [
  cookie(REFRESH_COOKIE_NAME)
    .notEmpty()
    .withMessage('Refresh token cookie is required.')
    .isJWT()
    .withMessage('Refresh token format is invalid.'),
];

export const logoutValidator = [
  cookie(REFRESH_COOKIE_NAME)
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('Invalid refresh token cookie format.'),
];
