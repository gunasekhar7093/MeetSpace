import apiClient, { API_BASE_URL } from './apiClient';

export const recordingService = {
  /**
   * Start a meeting recording (Host only)
   */
  async startRecording(meetingId, layout = 'grid') {
    const res = await apiClient.post(`/meetings/${meetingId}/recordings/start`, { layout });
    return res.data?.recording || null;
  },

  /**
   * Stop an active meeting recording (Host only)
   */
  async stopRecording(meetingId, recordingId = null) {
    const res = await apiClient.post(`/meetings/${meetingId}/recordings/stop`, { recordingId });
    return res.data?.recording || null;
  },

  /**
   * List recordings for a meeting
   */
  async listRecordings(meetingId) {
    const res = await apiClient.get(`/meetings/${meetingId}/recordings`);
    return res.data?.recordings || [];
  },

  /**
   * Get recording details
   */
  async getRecordingDetails(meetingId, recordingId) {
    const res = await apiClient.get(`/meetings/${meetingId}/recordings/${recordingId}`);
    return res.data?.recording || null;
  },

  /**
   * Build authenticated stream URL for video player
   */
  getStreamUrl(meetingId, recordingId) {
    return `${API_BASE_URL}/meetings/${meetingId}/recordings/${recordingId}/stream`;
  },

  /**
   * Build authenticated download URL
   */
  getDownloadUrl(meetingId, recordingId) {
    return `${API_BASE_URL}/meetings/${meetingId}/recordings/${recordingId}/download`;
  },
};

export default recordingService;

