import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { authLimiter, refreshLimiter } from '../middleware/rateLimit.middleware.js';
import {
  loginValidator,
  logoutValidator,
  refreshValidator,
  registerValidator,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', authLimiter, registerValidator, validateRequest, authController.register);
router.post('/login', authLimiter, loginValidator, validateRequest, authController.login);
router.post('/refresh', refreshLimiter, refreshValidator, validateRequest, authController.refresh);
router.post('/logout', logoutValidator, validateRequest, authController.logout);
router.get('/me', authenticate, authController.getMe);

export default router;
