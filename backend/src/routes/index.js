import { Router } from 'express';
import authRoutes from './auth.routes.js';
import meetingRoutes from './meeting.routes.js';
import livekitRoutes from './livekit.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

// Health check endpoints (Liveness & Readiness probes)
router.use('/health', healthRoutes);

// Application feature routes
router.use('/auth', authRoutes);
router.use('/meetings', meetingRoutes);
router.use('/livekit', livekitRoutes);

export default router;
