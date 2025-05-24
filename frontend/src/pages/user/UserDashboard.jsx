// src/pages/user/UserDashboard.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useCallback/useMemo
import { Link } from 'react-router-dom';
// Assume apiClient is configured in AuthContext to handle base URL and auth headers
import { useAuth, apiClient } from '../../contexts/AuthContext';
import {
    Calendar,
    Clock,
    Award,
    BookOpen,
    ChevronRight,
    AlertCircle, // For error display
    Loader2, // For loading spinner
    CheckCircle // For completed quizzes maybe
} from 'lucide-react';
import toast from 'react-hot-toast'; // *** IMPORT TOAST ***
import { format } from 'date-fns'; // Using date-fns for date formatting
import { isPast, differenceInMinutes, formatDistanceStrict } from 'date-fns'; // Date utility functions

// --- Helper Components ---

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-10 text-gray-600">
    <Loader2 className="w-10 h-10 mr-3 animate-spin text-blue-500" />
    Loading Dashboard...
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg shadow border border-red-200" role="alert">
    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div>
        <span className="font-medium">Error:</span> {message || 'Could not fetch data.'}
    </div>
  </div>
);

// --- Date Helper Functions (Refined) ---

const getIsoStringFromDateInput = (dateInput) => {
    if (!dateInput) return null;
    if (typeof dateInput === 'object' && dateInput !== null && dateInput.$date && typeof dateInput.$date === 'string') {
        if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput.$date)) { return dateInput.$date; }
        else { console.warn("Invalid $date value:", dateInput.$date); return null; }
    } else if (typeof dateInput === 'string') {
        if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput)) { return dateInput; }
        else { console.warn("Received non-ISO string:", dateInput); return null; }
    } else if (dateInput instanceof Date) {
        try { if (!isNaN(dateInput.getTime())) { return dateInput.toISOString(); } else { return null;} }
        catch (e) { console.error("Date->ISO err:", e); return null; }
    }
    console.warn("Unexpected date format:", dateInput); return null;
};

const formatDisplayDateTime = (dateInput) => {
    const isoString = getIsoStringFromDateInput(dateInput);
    if (!isoString) return "N/A";
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return format(date, 'MMM dd, yyyy h:mm a');
    } catch (e) { console.error("Error formatting date:", isoString, e); return "Invalid Date"; }
};

const formatDisplayDate = (dateInput) => {
     const isoString = getIsoStringFromDateInput(dateInput);
     if (!isoString) return 'N/A';
      try {
          const date = new Date(isoString);
          if (isNaN(date.getTime())) return 'Invalid Date';
          return date.toLocaleDateString(navigator.language || 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) { console.error("Error formatting date:", isoString, e); return 'Invalid Date'; }
};

const safeGetDate = (dateInput) => {
    const isoString = getIsoStringFromDateInput(dateInput);
    if (!isoString) return null;
    try { const date = new Date(isoString); return isNaN(date.getTime()) ? null : date; }
    catch { return null; }
};


// --- Main Component ---

const UserDashboard = () => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Wrap fetch logic in useCallback
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Ensure paths start with /api
      const [recommendationsRes, upcomingRes, submissionsRes] = await Promise.all([
        apiClient.get('/api/recommendations'),
        apiClient.get('/api/quiz/upcoming'),
        apiClient.get('/api/user/submissions')
      ]);

      // Process recommendations
      setRecommendations(recommendationsRes.data?.recommendations || []);

      // Process upcoming quizzes
      const upcomingQuizzesRaw = Array.isArray(upcomingRes.data?.quizzes) ? upcomingRes.data.quizzes : [];
      // Fetch registered separately to ensure atomicity with upcoming list
      const registeredRes = await apiClient.get('/api/quiz/registered');
      const registeredQuizIds = new Set(registeredRes.data?.registered_quiz_ids || []);
      const now = new Date();
      const mergedQuizzes = upcomingQuizzesRaw.map(quiz => {
            const scheduledTime = safeGetDate(quiz.scheduled_datetime);
            const isLive = scheduledTime ? isPast(scheduledTime) : false;
            const quizIdString = String(quiz._id || '');
            if (!quizIdString || quizIdString.length < 5) { return null; } // Validate ID
            return {
                ...quiz, _id: quizIdString,
                scheduled_datetime_obj: scheduledTime,
                original_scheduled_datetime: quiz.scheduled_datetime, // Keep original for display
                is_registered: registeredQuizIds.has(quizIdString),
                is_live: isLive,
            };
        }).filter(Boolean);
      setUpcomingQuizzes(mergedQuizzes);

      // Process submissions
      const submissionsData = Array.isArray(submissionsRes.data?.submissions) ? submissionsRes.data.submissions : [];
      const processedSubmissions = submissionsData.map(sub => ({
          ...sub,
          submission_id: String(sub.submission_id || sub._id || ''),
          quiz_id: String(sub.quiz_id || '')
      }));
      setRecentSubmissions(processedSubmissions.slice(0, 5));

    } catch (err) {
      console.error('Error fetching dashboard data:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.error || 'Failed to load dashboard data. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg); // Use toast for fetch errors
    } finally {
      setIsLoading(false);
    }
  // Add dependencies if needed (e.g., if it relies on user changing)
  }, []); // Assuming apiClient handles token globally

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]); // Trigger fetch

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Display error if fetch failed
  if (error) {
     return (
         <div className="p-4 md:p-6">
              <ErrorMessage message={error} />
         </div>
     );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Welcome back, {user?.name || 'User'}!</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Upcoming Quizzes */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="text-blue-600" size={20} />
              <h2 className="text-lg font-semibold">Upcoming Quizzes</h2>
            </div>
            <Link to="/user/upcoming" className="text-sm font-medium text-blue-600 hover:underline">
              View All
            </Link>
          </div>

          {upcomingQuizzes.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming quizzes scheduled right now.</p>
          ) : (
            <div className="space-y-4">
              {upcomingQuizzes.slice(0, 3).map((quiz) => (
                <div key={quiz._id} className="p-3 transition-all border border-gray-100 rounded-md hover:shadow-md hover:border-gray-200 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{quiz.topic}</h3>
                      <p className="text-xs text-gray-500">{quiz.type} - {quiz.questions?.length ?? '?'} Qs</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        quiz.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                        quiz.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                      {quiz.difficulty || 'Medium'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                     <div className="flex items-center text-xs text-gray-600">
                        <Clock size={12} className="mr-1 flex-shrink-0" />
                        {/* Use the original value with the formatter */}
                        Starts: {formatDisplayDateTime(quiz.original_scheduled_datetime)}
                     </div>
                     <Link
                       to={`/user/upcoming`} // Link to the full list page might be better here
                       className="flex items-center px-2 py-1 text-xs text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                       aria-label={`View details for quiz ${quiz.topic}`}
                     >
                       Details <ChevronRight size={14} className="ml-0.5" />
                     </Link>
                  </div>
                </div>
              ))}
              {upcomingQuizzes.length > 3 && (
                  <div className="text-center mt-2">
                    <Link to="/user/upcoming" className="text-sm font-medium text-blue-600 hover:underline">
                      + {upcomingQuizzes.length - 3} more upcoming
                    </Link>
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Quiz Submissions */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-gray-700">
              <BookOpen className="text-green-600" size={20} />
              <h2 className="text-lg font-semibold">Recent Submissions</h2>
            </div>
            <Link to="/user/history" className="text-sm font-medium text-blue-600 hover:underline">
              View All History
            </Link>
          </div>

          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-gray-500">You haven't completed any quizzes recently.</p>
          ) : (
            <div className="space-y-3">
              {recentSubmissions.map((submission) => (
                <div key={submission.submission_id} className="p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded-sm">
                  <div className="flex items-center justify-between gap-2">
                     <span className="text-sm font-medium text-gray-800 truncate" title={submission.quiz_topic}>
                         <CheckCircle size={14} className="inline mr-1.5 text-green-500" />
                         {submission.quiz_topic || 'Quiz Attempt'}
                     </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatDisplayDate(submission.submitted_at)}
                    </span>
                  </div>
                    <div className="flex items-center justify-between mt-1">
                       <span className="text-xs text-gray-600">{submission.quiz_type || 'Quiz'}</span>
                       <span className="text-xs font-semibold text-green-700">
                         Score: {submission.score}/{submission.total}
                       </span>
                     </div>
                    <div className="text-right mt-1">
                        <Link
                            to={`/user/results/${submission.quiz_id}`} // Use string quiz_id
                            className="text-xs font-medium text-blue-600 hover:underline"
                        >
                            View Results
                        </Link>
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Topics */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm md:p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4 text-gray-700">
            <Award className="text-amber-500" size={20} />
            <h2 className="text-lg font-semibold">Recommended Topics For You</h2>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-sm text-gray-500">Start taking quizzes to get recommendations!</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recommendations.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded-full cursor-default"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;