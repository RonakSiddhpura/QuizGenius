
// src/pages/user/UserUpcomingQuizzes.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
// Assuming apiClient is configured in AuthContext
import { useAuth, apiClient } from '../../contexts/AuthContext';
import {
    Calendar,
    Clock,
    Filter,
    ChevronRight,
    UserCheck,
    AlertCircle,
    Loader2,
    Lock,
    PlayCircle,
    Info,
    Hourglass
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { isPast, differenceInMinutes, formatDistanceStrict } from 'date-fns';

// --- Helper Components ---

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-10 text-gray-600">
    <Loader2 className="w-10 h-10 mr-3 animate-spin text-blue-500" />
    Loading Upcoming Quizzes...
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg shadow border border-red-200" role="alert">
    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div><span className="font-medium">Error:</span> {message || 'Could not fetch data.'}</div>
  </div>
);

// --- Date Helper Functions (Robust handling for various inputs) ---

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
    } catch (e) { console.error("Fmt err:", isoString, e); return "Formatting Error"; }
};

const safeGetDate = (dateInput) => {
    const isoString = getIsoStringFromDateInput(dateInput);
    if (!isoString) return null;
    try { const date = new Date(isoString); return isNaN(date.getTime()) ? null : date; }
    catch { return null; }
};

// --- Main Component ---

const UserUpcomingQuizzes = () => {
  // State variables
  const [quizzes, setQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRegistering, setIsRegistering] = useState(null);
  const [filter, setFilter] = useState('all');

  // Fetch Upcoming Quizzes and User's Registrations
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let isMounted = true;

    try {
      // Fetch both endpoints concurrently
      const [upcomingRes, registeredRes] = await Promise.all([
        apiClient.get('/api/quiz/upcoming'),
        apiClient.get('/api/quiz/registered')
      ]);

      if (!isMounted) return;

      // Safely extract data
      const upcomingQuizzesRaw = Array.isArray(upcomingRes.data?.quizzes) ? upcomingRes.data.quizzes : [];
      const registeredQuizIds = new Set(registeredRes.data?.registered_quiz_ids || []);

      const now = new Date();

      // Process fetched quizzes with improved ID handling
      const mergedQuizzes = upcomingQuizzesRaw
        .map(quiz => {
            // IMPROVED ID EXTRACTION - Handle all possible formats
            let quizIdString;
            
            if (quiz._id) {
                // Handle MongoDB ObjectId format
                if (typeof quiz._id === 'object' && quiz._id.$oid) {
                    quizIdString = quiz._id.$oid;
                }
                // Handle direct string IDs (as seen in sample data)
                else if (typeof quiz._id === 'string') {
                    quizIdString = quiz._id;
                }
                // Handle any other format by converting to string
                else {
                    quizIdString = String(quiz._id);
                }
            } else {
                console.warn("Quiz missing ID:", quiz);
                return null;
            }

            // Get valid Date object or null
            const scheduledTime = safeGetDate(quiz.scheduled_datetime);
            const isLive = scheduledTime ? isPast(scheduledTime) : false;

            // Validate ID before returning
            if (!quizIdString || quizIdString.length < 5) {
                console.warn("Skipping quiz with invalid ID:", quiz);
                return null;
            }

            return {
                ...quiz,
                _id: quizIdString, // Store guaranteed string ID
                scheduled_datetime_obj: scheduledTime,
                original_scheduled_datetime: quiz.scheduled_datetime,
                is_registered: registeredQuizIds.has(quizIdString),
                is_live: isLive,
            };
        })
        .filter(Boolean); // Remove nulls

      setQuizzes(mergedQuizzes);
      console.log("Processed upcoming quizzes:", mergedQuizzes);

    } catch (err) {
      if (!isMounted) return;
      console.error('Error fetching upcoming quizzes data:', err);
      const errorMsg = err.response?.data?.error || err.message || "Failed to load quizzes.";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      if (isMounted) setIsLoading(false);
    }
  }, []);

  // Effect to run fetchAllData on mount
  useEffect(() => {
      fetchAllData();
  }, [fetchAllData]);

  // --- Register for a Quiz Function ---
  const registerForQuiz = useCallback(async (quizIdString) => {
    console.log(">>> registerForQuiz called with ID:", quizIdString, "(Type:", typeof quizIdString, ")");

    // Validate the STRING ID more thoroughly
    if (!quizIdString || typeof quizIdString !== 'string' || quizIdString.length < 5 || isRegistering === quizIdString) {
        console.warn("Registration attempt skipped:", quizIdString);
        if(isRegistering === quizIdString) toast.error("Processing...");
        return;
    }

    setIsRegistering(quizIdString);
    try {
        // Use the guaranteed string ID in the URL path
        const apiUrl = `/api/quiz/register/${quizIdString}`;
        console.log(">>> Registering POST to:", apiUrl);
        const response = await apiClient.post(apiUrl);

        // Optimistic update using string ID
        setQuizzes(prev => prev.map(q => q._id === quizIdString ? { ...q, is_registered: true } : q));
        toast.success(response.data?.message || "Registered!");
    } catch (error) {
        console.error('Error registering for quiz:', error);
        const errorMsg = error.response?.data?.error || error.message || "Registration failed.";
        toast.error(errorMsg);
    } finally {
        setIsRegistering(null);
    }
  }, [isRegistering]);

  // --- Helper Functions for Display ---
  const isQuizStartingSoon = (scheduledTimeObj) => {
    if (!scheduledTimeObj || isNaN(scheduledTimeObj.getTime()) || isPast(scheduledTimeObj)) return false;
    return differenceInMinutes(scheduledTimeObj, new Date()) <= 30;
  };

  const getTimeRemaining = (scheduledTimeObj, isLiveFlag) => {
    if (isLiveFlag) return 'Live Now / Starting';
    if (!scheduledTimeObj || isNaN(scheduledTimeObj.getTime())) return 'N/A';
    return `Starts ${formatDistanceStrict(scheduledTimeObj, new Date(), { addSuffix: true })}`;
  };

  // --- Filter Logic ---
  const filteredQuizzes = useMemo(() => {
    if (!Array.isArray(quizzes)) return [];
    return quizzes.filter(quiz => {
        if (filter === 'registered') return quiz.is_registered;
        if (filter === 'not-registered') return !quiz.is_registered;
        return true; // 'all'
    });
  }, [quizzes, filter]);

  // --- Render Logic ---
  if (isLoading) { return <LoadingSpinner />; }
  if (error && !isLoading) { return <div className="p-4 md:p-6"><ErrorMessage message={error} /></div>; }

  return (
    <div className="p-4 md:p-6">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Upcoming Quizzes</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Filter size={16} className="text-gray-500" />
          <select
            className="p-2 text-sm border border-gray-300 rounded-md bg-white shadow-sm focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter quizzes"
          >
            <option value="all">Show All</option>
            <option value="registered">Registered</option>
            <option value="not-registered">Not Registered</option>
          </select>
        </div>
      </div>

      {/* Quiz List or Empty State */}
      {filteredQuizzes.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-lg shadow border border-gray-200">
          <Calendar size={48} className="mx-auto mb-4 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-700">
            {quizzes.length === 0 ? 'No Upcoming Quizzes Found' : `No ${filter === 'registered' ? 'Registered' : 'Unregistered'} Quizzes Found`}
          </h3>
          <p className="text-sm text-gray-500">
            {quizzes.length === 0 ? 'Check back later for scheduled quizzes!' : 'Try changing the filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredQuizzes.map((quiz) => {
            // Destructure data processed in useEffect
            const { _id: id, is_registered, is_live, scheduled_datetime_obj, original_scheduled_datetime } = quiz;
            const startingSoon = !is_live && isQuizStartingSoon(scheduled_datetime_obj);
            const canAttempt = is_registered && is_live;

            return (
              <div
                key={id}
                className={`flex flex-col overflow-hidden bg-white rounded-lg shadow-md border transition-shadow hover:shadow-lg ${ startingSoon ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200' } ${is_live ? 'border-green-300 ring-1 ring-green-200' : ''}`}
              >
                {/* Status Banners */}
                {is_live && ( <div className="px-4 py-1 text-xs font-bold text-center text-green-800 bg-green-100"> LIVE NOW </div> )}
                {!is_live && startingSoon && ( <div className="px-4 py-1 text-xs font-medium text-center text-amber-800 bg-amber-100"> Starting Soon! </div> )}

                <div className="p-5 flex-grow flex flex-col">
                  {/* Top section */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 break-words mr-2">{quiz.topic}</h3>
                    {quiz.difficulty && ( <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${ quiz.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : quiz.difficulty === 'Medium' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700' }`}> {quiz.difficulty} </span> )}
                  </div>
                  <p className="text-sm text-gray-500 mb-3"> {quiz.type} ({quiz.questions?.length ?? '?'} Qs) </p>
                  {/* Scheduled Time */}
                  <div className="flex items-center mt-2 text-sm text-gray-700"> <Calendar size={15} className="mr-2 text-gray-500 flex-shrink-0" /> <span>Starts: {formatDisplayDateTime(original_scheduled_datetime)}</span> </div>
                  {/* Time Remaining */}
                  <div className="flex items-center mt-2 text-sm font-medium"> <Hourglass size={15} className={`mr-2 flex-shrink-0 ${is_live ? 'text-green-600' : 'text-indigo-500'}`} /> <span>{getTimeRemaining(scheduled_datetime_obj, is_live)}</span> </div>
                  <div className="flex-grow"></div> {/* Spacer */}

                  {/* Bottom section: Actions */}
                  <div className="mt-5 pt-4 border-t border-gray-100">
                      {/* Registration Button */}
                      {!is_registered && !is_live && (
                          <button
                            onClick={() => registerForQuiz(id)}
                            disabled={isRegistering === id}
                            className={`w-full inline-flex justify-center items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out ${ isRegistering === id ? 'bg-gray-300 text-gray-500 cursor-wait' : 'bg-indigo-600 text-white hover:bg-indigo-700' }`}
                          >
                            {isRegistering === id ? ( <Loader2 className="h-4 w-4 mr-2 animate-spin" /> ) : null }
                            {isRegistering === id ? 'Registering...' : 'Register Now'}
                          </button>
                       )}
                      {/* Registered Status & Start Button */}
                      {is_registered && (
                         <div className="flex items-center justify-between">
                             <div className="flex items-center text-sm text-green-600 font-medium"> <UserCheck size={16} className="mr-1.5" /> <span>Registered</span> </div>
                             <Link
                                to={`/user/quiz/${id}`}
                                onClick={(e) => { if (!canAttempt) e.preventDefault(); }}
                                aria-disabled={!canAttempt}
                                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${ canAttempt ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm' : 'bg-gray-200 text-gray-500 cursor-not-allowed' }`}
                                title={!canAttempt ? (is_registered ? "Quiz hasn't started yet" : "Register first") : "Start Quiz"}
                             > <PlayCircle size={16} className="mr-1" /> Start Quiz </Link>
                         </div>
                      )}
                      {/* Info message */}
                       {!is_registered && is_live && ( <div className="mt-3 flex items-center text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200"> <Lock size={14} className="mr-1.5 flex-shrink-0" /> <span>Registration closed (Quiz is live)</span> </div> )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserUpcomingQuizzes;