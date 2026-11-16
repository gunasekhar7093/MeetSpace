import { useCallback, useEffect, useState } from 'react';
import { meetingService } from '../services/meetingService';
import { useAuth } from '../hooks/useAppContext';
import { MeetingContext } from './contexts';

export function MeetingProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  const fetchDashboardMeetings = useCallback(async () => {
    if (!isAuthenticated) {
      setMeetings([]);
      setRecentHistory([]);
      return;
    }

    setLoadingMeetings(true);
    setMeetingsError('');
    try {
      const [activeRes, historyRes] = await Promise.all([
        meetingService.getMeetings({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc' }),
        meetingService.getMeetingHistory({ page: 1, limit: 3, sortBy: 'endedAt', sortOrder: 'desc' }),
      ]);
      setMeetings(activeRes.meetings || []);
      setRecentHistory(historyRes.history || []);
    } catch (err) {
      setMeetingsError(err.message || 'Failed to load meetings.');
    } finally {
      setLoadingMeetings(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      if (!isAuthenticated) {
        if (active) {
          setMeetings([]);
          setRecentHistory([]);
          setMeetingsError('');
        }
        return;
      }

      try {
        const [activeRes, historyRes] = await Promise.all([
          meetingService.getMeetings({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc' }),
          meetingService.getMeetingHistory({ page: 1, limit: 3, sortBy: 'endedAt', sortOrder: 'desc' }),
        ]);
        if (active) {
          setMeetings(activeRes.meetings || []);
          setRecentHistory(historyRes.history || []);
          setMeetingsError('');
        }
      } catch (err) {
        if (active) {
          setMeetingsError(err.message || 'Failed to load meetings.');
        }
      } finally {
        if (active) {
          setLoadingMeetings(false);
        }
      }
    }

    loadInitial();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const createMeeting = useCallback(async (payload) => {
    const created = await meetingService.createMeeting(payload);
    if (created) {
      setMeetings((prev) => [created, ...prev]);
    }
    return created;
  }, []);

  const cancelMeetingByCode = useCallback(async (meetingId) => {
    const updated = await meetingService.cancelMeeting(meetingId);
    if (updated) {
      setMeetings((prev) =>
        prev.map((m) =>
          m.meetingId.toLowerCase() === meetingId.toLowerCase() ? updated : m
        )
      );
    }
    return updated;
  }, []);

  const syncMeetingInList = useCallback((updatedMeeting) => {
    if (!updatedMeeting) return;
    setMeetings((prev) => {
      const exists = prev.some((m) => m.meetingId === updatedMeeting.meetingId);
      if (!exists) return [updatedMeeting, ...prev];
      return prev.map((m) =>
        m.meetingId === updatedMeeting.meetingId ? updatedMeeting : m
      );
    });
  }, []);

  const upcomingMeetings = meetings.filter(
    (m) => m.status === 'scheduled' || m.status === 'active'
  );

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        upcomingMeetings,
        recentHistory,
        loadingMeetings,
        meetingsError,
        fetchDashboardMeetings,
        createMeeting,
        cancelMeetingByCode,
        syncMeetingInList,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}
