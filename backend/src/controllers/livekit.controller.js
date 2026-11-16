import * as livekitService from '../services/livekit.service.js';
import { sendSuccess } from '../utils/ApiResponse.js';

export async function getLiveKitToken(req, res, next) {
  try {
    const { meetingId } = req.body;
    const result = await livekitService.generateLiveKitToken({
      meetingId,
      user: req.user,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'LiveKit media token generated successfully.',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

