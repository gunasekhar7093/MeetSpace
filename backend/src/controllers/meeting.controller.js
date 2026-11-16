import * as meetingService from '../services/meeting.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import {
  notifyMeetingCancelled,
  notifyMeetingEnded,
} from '../socket/socket.js';

export const createMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.createMeeting(req.userId, req.body);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Meeting created successfully.',
    data: result,
  });
});

export const listMeetings = asyncHandler(async (req, res) => {
  const result = await meetingService.listMeetings(req.userId, req.query);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meetings retrieved successfully.',
    data: result,
  });
});

export const getMeetingHistory = asyncHandler(async (req, res) => {
  const result = await meetingService.getMeetingHistory(req.userId, req.query);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meeting history retrieved successfully.',
    data: result,
  });
});

export const getMeetingDetails = asyncHandler(async (req, res) => {
  const result = await meetingService.getMeetingDetails(
    req.params.meetingId,
    req.userId
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meeting details retrieved successfully.',
    data: result,
  });
});

export const joinMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.joinMeeting(req.params.meetingId, req.userId);

  return sendSuccess(res, {
    statusCode: 200,
    message: result.participant.alreadyJoined
      ? 'You are already in this meeting.'
      : 'Joined meeting successfully.',
    data: result,
  });
});

export const leaveMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.leaveMeeting(req.params.meetingId, req.userId);

  return sendSuccess(res, {
    statusCode: 200,
    message: result.participant.alreadyLeft
      ? 'You have already left this meeting.'
      : 'Left meeting successfully.',
    data: result,
  });
});

export const endMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.endMeeting(req.params.meetingId, req.userId);
  notifyMeetingEnded(req.params.meetingId, result.summary);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meeting ended successfully.',
    data: result,
  });
});

export const updateMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.updateMeeting(
    req.params.meetingId,
    req.userId,
    req.body
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meeting updated successfully.',
    data: result,
  });
});

export const cancelMeeting = asyncHandler(async (req, res) => {
  const result = await meetingService.cancelMeeting(req.params.meetingId, req.userId);
  notifyMeetingCancelled(req.params.meetingId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Meeting cancelled successfully.',
    data: result,
  });
});

