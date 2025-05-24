
// src/pages/user/UserHistory.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
// Assume apiClient is configured in AuthContext
import { useAuth, apiClient } from '../../contexts/AuthContext';
import {
    Calendar,
    Award, // Use for score
    Search,
    AlertCircle,
    Info,
    Loader2, // Use consistent loader
    List // Use for history/list icon
} from 'lucide-react';
import { format } from 'date-fns'; // Use date-fns for reliable formatting

// Reusable Loading Spinner Component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-10 text-gray-600">
    <Loader2 className="w-10 h-10 mr-3 animate-spin text-blue-500" />
    Loading History...
  </div>
);

// Reusable Error Message Component
const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg shadow border border-red-200" role="alert">
    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <div><span className="font-medium">Error:</span> {message || 'Could not fetch data.'}</div>
  </div>
);

// Reusable Info Message Component
const InfoMessage = ({ message }) => (
    <div className="flex items-center p-4 my-4 text-sm text-blue-700 bg-blue-100 rounded-lg shadow border border-blue-200" role="alert">
      <Info className="w-5 h-5 mr-3 flex-shrink-0" />
      <div>{message}</div>
    </div>
  );

// --- Date Helper Functions (matching those in UserDashboard) ---

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

const UserHistory = () => {
  // State now holds submission objects
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Removed filterAction state as we only fetch submissions now

  useEffect(() => {
    const fetchSubmissions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // *** CORRECTED API ENDPOINT ***
        const response = await apiClient.get('/api/user/submissions');

        // Backend returns { submissions: [...] }
        const processedSubmissions = (response.data?.submissions || []).map(sub => ({
            ...sub,
            submission_id: String(sub.submission_id || sub._id || ''),
            quiz_id: String(sub.quiz_id || '')
        }));
        setSubmissions(processedSubmissions);

      } catch (err) {
        console.error('Error fetching submissions:', err.response?.data || err.message);
        setError(err.response?.data?.error || 'Failed to load submission history. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubmissions();
  }, []); // Fetch only on mount

  // Filter submissions based on search term (quiz_topic)
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(item => {
      // Search: Check quiz_topic safely
      const topic = item.quiz_topic || ''; // Default to empty string if missing
      return topic.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [submissions, searchTerm]);

  const getScoreDisplay = (score, total) => {
    if (score === undefined || score === null || total === undefined || total === null || total === 0) {
        return { text: 'N/A', color: 'text-gray-500' };
    }
    const percentage = (score / total) * 100;
    let color = 'text-red-600';
    if (percentage >= 80) color = 'text-green-600';
    else if (percentage >= 50) color = 'text-yellow-600';
    return { text: `${score}/${total}`, color };
  };

  // --- Render Component for a Single Submission ---
  const renderSubmissionItem = (submission) => {
    const scoreInfo = getScoreDisplay(submission.score, submission.total);

    return (
      <div key={submission.submission_id} className="bg-white p-4 rounded-lg shadow border border-gray-100 hover:shadow-md transition-shadow duration-200">
        {/* Quiz Topic and Date */}
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 className="font-semibold text-base text-gray-800 mr-2 truncate" title={submission.quiz_topic}>
            {submission.quiz_topic || 'Quiz Attempt'}
          </h3>
          {/* Date Submitted */}
          <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
              {formatDisplayDateTime(submission.submitted_at)}
          </span>
        </div>

        {/* Quiz Type */}
        {submission.quiz_type && (
            <div className="text-xs text-gray-500 mb-3">
                Type: {submission.quiz_type}
            </div>
        )}

        {/* Score and Results Link */}
        <div className="mt-3 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center text-gray-600">
              <Award className={`h-4 w-4 mr-1.5 ${scoreInfo.color}`} />
              <span className="font-medium">Score:</span>
            </div>
            <span className={`font-semibold ${scoreInfo.color}`}>
              {scoreInfo.text}
            </span>
          </div>

          {/* Link to results page */}
          <div className="text-right">
            <Link
              to={`/user/results/${submission.quiz_id}`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View Results & Details
            </Link>
          </div>
        </div>
      </div>
    );
  };

  // --- Main Render ---

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800 flex items-center">
        <List className="mr-3 h-7 w-7 text-indigo-600 flex-shrink-0" /> {/* Changed Icon */}
        My Quiz History
      </h1>

      {/* Search Input Only */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-grow w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search by quiz topic..."
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search submission history by topic"
          />
        </div>
        {/* Removed Action Filter Dropdown */}
      </div>

      {/* Display Submissions */}
      {filteredSubmissions.length === 0 ? (
        <InfoMessage message={submissions.length === 0 ? "You haven't submitted any quizzes yet." : "No submissions match your search."} />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Map over filtered submissions and render each item */}
          {filteredSubmissions.map(renderSubmissionItem)}
        </div>
      )}
    </div>
  );
};

export default UserHistory;