import * as egressService from '../services/egress.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';

export const startRecording = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { layout } = req.body;
  const recording = await egressService.startMeetingRecording({
    meetingId,
    userId: req.userId,
    layout,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Recording started successfully.',
    data: { recording: recording.toJSON() },
  });
});

export const stopRecording = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { recordingId } = req.body;
  const recording = await egressService.stopMeetingRecording({
    meetingId,
    recordingId,
    userId: req.userId,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Recording stopping.',
    data: { recording: recording.toJSON() },
  });
});

export const listRecordings = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const recordings = await egressService.listMeetingRecordings({
    meetingId,
    userId: req.userId,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Recordings retrieved successfully.',
    data: { recordings },
  });
});

export const getRecording = asyncHandler(async (req, res) => {
  const { meetingId, recordingId } = req.params;
  const recording = await egressService.getRecordingDetails({
    meetingId,
    recordingId,
    userId: req.userId,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Recording details retrieved successfully.',
    data: { recording },
  });
});

export const streamRecordingFile = asyncHandler(async (req, res) => {
  const { meetingId, recordingId } = req.params;
  await egressService.streamRecording({
    meetingId,
    recordingId,
    userId: req.userId,
    req,
    res,
  });
});

export const downloadRecordingFile = asyncHandler(async (req, res) => {
  const { meetingId, recordingId } = req.params;
  await egressService.downloadRecording({
    meetingId,
    recordingId,
    userId: req.userId,
    res,
  });
});

export const handleLiveKitWebhook = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  // Use rawBody (string) or JSON stringified body
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body);
  const result = await egressService.handleWebhookEvent(rawBody, authHeader);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Webhook processed successfully.',
    data: result,
  });
});

