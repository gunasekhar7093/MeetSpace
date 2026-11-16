import apiClient from './apiClient';

const simulateDelay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * User profile and preferences service layer (mock implementation).
 */
export const userService = {
  apiClient,

  async updateProfile(profileData) {
    await simulateDelay(350);
    return {
      ...profileData,
      updatedAt: new Date().toISOString(),
    };
  },

  async updateSettings(settingsData) {
    await simulateDelay(300);
    return {
      ...settingsData,
      savedAt: new Date().toISOString(),
    };
  },
};

