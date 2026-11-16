import apiClient from './apiClient';

export const meetingService = {
  apiClient,

  async createMeeting(payload) {
    const response = await apiClient.post('/meetings', {
      title: payload.title,
      description: payload.description || '',
      isInstant: Boolean(payload.isInstant),
      ...(payload.isInstant ? {} : { scheduledAt: payload.scheduledAt }),
      ...(payload.settings ? { settings: payload.settings } : {}),
    });
    return response.data?.meeting;
  },

  async getMeetings(params = {}) {
    const response = await apiClient.get('/meetings', { params });
    return {
      meetings: response.data?.meetings || [],
      pagination: response.data?.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  },

  async getMeetingDetails(meetingId) {
    const response = await apiClient.get(`/meetings/${encodeURIComponent(meetingId)}`);
    return response.data?.meeting;
  },

  async joinMeeting(meetingId) {
    const response = await apiClient.post(
      `/meetings/${encodeURIComponent(meetingId)}/join`,
      {}
    );
    return response.data;
  },

  async leaveMeeting(meetingId) {
    const response = await apiClient.post(
      `/meetings/${encodeURIComponent(meetingId)}/leave`,
      {}
    );
    return response.data;
  },

  async endMeeting(meetingId) {
    const response = await apiClient.post(
      `/meetings/${encodeURIComponent(meetingId)}/end`,
      {}
    );
    return response.data;
  },

  async updateMeeting(meetingId, updates) {
    const response = await apiClient.patch(
      `/meetings/${encodeURIComponent(meetingId)}`,
      updates
    );
    return response.data?.meeting;
  },

  async cancelMeeting(meetingId) {
    const response = await apiClient.delete(
      `/meetings/${encodeURIComponent(meetingId)}`
    );
    return response.data?.meeting;
  },

  async getMeetingHistory(params = {}) {
    const response = await apiClient.get('/meetings/history', { params });
    return {
      history: response.data?.history || [],
      pagination: response.data?.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  },
};
