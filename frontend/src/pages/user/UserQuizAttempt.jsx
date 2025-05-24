//src/pages/admin/AdminCreateQuiz.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// Assuming apiClient is configured in AuthContext
import { useAuth, apiClient } from '../../contexts/AuthContext';
import { Clock, AlertTriangle, CheckCircle, ArrowRight, ArrowLeft, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast'; // Added toast for potential errors
import { format, isPast, differenceInMinutes, formatDistanceStrict } from 'date-fns';

// --- Helper Components ---
const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-gray-600">
      <Loader2 className="w-12 h-12 mb-4 animate-spin text-blue-500" />
      <p className="text-lg">Loading Quiz...</p>
    </div>
  );

const ErrorMessage = ({ message }) => (
    <div className="flex items-center p-4 my-4 text-sm text-red-700 bg-red-100 rounded-lg shadow border border-red-200" role="alert">
      <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
      <div><span className="font-medium">Error:</span> {message || 'Could not load the quiz.'}</div>
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

const UserQuizAttempt = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // Submit Handler - Defined EARLY with useCallback
  // IMPORTANT: This function is now defined BEFORE it's used in useEffect
  const handleSubmitCallback = useCallback(async (isAutoSubmit = false) => {
    if (isSubmitting) return;

    if (!isAutoSubmit) {
        const unansweredCount = selectedAnswers.filter(a => a === null).length;
        const confirmMsg = unansweredCount > 0
            ? `You have ${unansweredCount} unanswered question(s). Submit anyway?`
            : "Submit your final answers?";
        if (!window.confirm(confirmMsg)) return;
    } else {
        toast.error("Time's up! Submitting your answers automatically.", { icon: '⏰', duration: 4000 });
    }

    setIsSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      const timeTakenSeconds = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : null;
      const answersToSubmit = selectedAnswers.map(ans => ans); // Should be 'a', 'b', etc. or null

      console.log("Submitting:", { answers: answersToSubmit, time_taken: timeTakenSeconds });

      const response = await apiClient.post(`/api/quiz/submit/${quizId}`, {
        answers: answersToSubmit,
        time_taken: timeTakenSeconds
      });

      toast.success('Quiz submitted successfully!');
      const resultId = response.data?.submission_id || quizId;
      // navigate(`/user/results/${resultId}`);
      navigate(`/user/results/${quizId}`);

    } catch (err) {
      console.error('Error submitting quiz:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.error || 'Failed to submit quiz. Please try again.';
      toast.error(errorMsg);
      // Only reset submitting state on error, so user *can* retry
      // If navigation happens on success, no need to reset.
      setIsSubmitting(false);
    }
  }, [quizId, selectedAnswers, isSubmitting, navigate]);

  // --- Fetch Quiz Data ---
  useEffect(() => {
    let isMounted = true;

    const fetchQuiz = async () => {
      setLoading(true);
      setError('');
      startTimeRef.current = Date.now(); // Record precise start time

      try {
        const response = await apiClient.get(`/api/quiz/${quizId}`); // Use apiClient
        const data = response.data;

        if (!isMounted) return;

        // Basic validation of received data
        if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
            throw new Error("Invalid quiz data received or quiz has no questions.");
        }

        setQuizData(data);
        setSelectedAnswers(new Array(data.questions.length).fill(null));

        // --- Timer Logic (Uses end_datetime from backend) ---
        if (data.end_datetime) { // Check if backend provided end time
            const endTimeDate = safeGetDate(data.end_datetime);
            const now = startTimeRef.current;
            
            if (endTimeDate) {
                const endTime = endTimeDate.getTime();
                const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));

                if (remainingSeconds <= 0) {
                    // If calculated time is already up based on fetch time
                    setError("This quiz attempt window has already closed.");
                    setTimeLeft(0);
                    // Optionally auto-submit immediately or just show error
                } else {
                    setTimeLeft(remainingSeconds);
                    console.log(`Timer initialized. End time: ${data.end_datetime}, Remaining: ${remainingSeconds}s`);
                }
            } else {
                console.warn("Invalid end date format:", data.end_datetime);
                setTimeLeft(null);
            }
        } else {
            console.warn("Quiz end time not provided by backend. Timer disabled.");
            setTimeLeft(null); // Timer disabled
        }

      } catch (err) {
        if (!isMounted) return;
        console.error('Error loading quiz:', err.response?.data || err.message);
        const errorMsg = err.response?.data?.error || err.message || 'Failed to load quiz.';
        // Handle specific statuses
        if (err.response?.status === 403) { setError(`Access Denied: ${errorMsg}`); }
        else if (err.response?.status === 404) { setError(`Quiz Not Found: ${errorMsg}`); }
        else { setError(errorMsg); }
      } finally {
        if (isMounted) { setLoading(false); }
      }
    };

    fetchQuiz();

    return () => { isMounted = false; if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [quizId]); // Only depends on quizId

  // --- Timer Countdown Effect ---
  useEffect(() => {
    // No need to check !quizData here, as timeLeft will be null initially

    if (intervalRef.current) clearInterval(intervalRef.current); // Clear previous interval

    if (timeLeft === null || timeLeft <= 0 || isSubmitting) {
      if (timeLeft === 0 && !isSubmitting) { // Check if time hit 0 and not already submitting
          console.log("Time's up! Triggering auto-submit.");
          // Use the callback version for submitting
          handleSubmitCallback(true);
      }
      return; // Don't start timer
    }

    // Start new interval
    intervalRef.current = setInterval(() => {
      setTimeLeft(prevTime => {
          const newTime = Math.max(0, (prevTime ?? 0) - 1); // Ensure prevTime isn't null
          if (newTime === 0) {
              clearInterval(intervalRef.current); // Stop interval immediately
              // Auto-submit logic moved to the outer check
          }
          return newTime;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timeLeft, isSubmitting, handleSubmitCallback]); // Now handleSubmitCallback is properly defined before use

  // --- Event Handlers ---
  const handleSelectAnswer = useCallback((optionValue) => {
    if (isSubmitting) return; // Prevent changing answers during submit
    setSelectedAnswers(prevAnswers => {
      const newAnswers = [...prevAnswers];
      newAnswers[currentQuestionIndex] = optionValue;
      return newAnswers;
    });
  }, [currentQuestionIndex, isSubmitting]);

  const handleNextQuestion = useCallback(() => {
    if (quizData && currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
    }
  }, [currentQuestionIndex, quizData]);

  const handlePreviousQuestion = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prevIndex => prevIndex - 1); // Corrected to decrement
    }
  }, [currentQuestionIndex]);

  // --- Helper Functions ---
  const formatTime = (seconds) => {
    if (seconds === null || seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Render Logic ---

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
       <div className="p-6 max-w-xl mx-auto text-center">
            <ErrorMessage message={error} />
            <button onClick={() => navigate('/user')} className="mt-4 bg-blue-600 ..."> Go to Dashboard </button>
       </div>
    );
  }

  if (!quizData || !quizData.questions || quizData.questions.length === 0) {
    return <ErrorMessage message="Quiz data is invalid or contains no questions." />;
  }

  const currentQ = quizData.questions[currentQuestionIndex];
  const totalQuestions = quizData.questions.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const isFirstQuestion = currentQuestionIndex === 0;
  const answeredQuestionsCount = selectedAnswers.filter(answer => answer !== null).length;
  const progressPercentage = totalQuestions > 0 ? (answeredQuestionsCount / totalQuestions) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-10"> {/* Added bottom padding */}
      {/* Quiz Header & Timer */}
      <div className="bg-white rounded-lg shadow border border-gray-100 p-4 md:p-6 sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 text-center sm:text-left">{quizData.topic}</h1>
          {/* Timer Display */}
          {timeLeft !== null && (
            <div className={`text-lg font-semibold px-3 py-1 rounded-md flex items-center shadow-inner ${ timeLeft < 60 ? 'text-red-600 bg-red-100 ring-1 ring-red-200' : 'text-blue-700 bg-blue-100 ring-1 ring-blue-200' }`}>
                <Clock className="h-5 w-5 mr-1.5" /> <span>{formatTime(timeLeft)}</span>
            </div>
          )}
           {/* Show if timer is disabled */}
           {timeLeft === null && <span className="text-sm text-gray-500 italic">(Untimed)</span>}
        </div>
        {/* Progress Bar */}
        <div className="mb-2">
             <div className="flex justify-between text-xs text-gray-500 mb-1"> <span>Progress</span> <span>{answeredQuestionsCount}/{totalQuestions} Answered</span> </div>
             <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden"> <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPercentage}%` }}></div> </div>
        </div>
      </div>

      {/* Current Question Card */}
      <div className="bg-white rounded-lg shadow border border-gray-100 p-4 md:p-6">
        <div className="flex justify-between items-center mb-3 text-sm font-medium text-gray-500">
          <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
          <span>{quizData.difficulty} • {quizData.language}</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-5 leading-relaxed">{currentQ?.question || '...'}</h2>
        <div className="space-y-3">
          {currentQ?.options?.map((option, index) => {
            const match = option.match(/^\s*([a-d])[\.\)]?\s*(.*)/s);
            const optionValue = match ? match[1].toLowerCase() : null;
            const optionText = match ? match[2].trim() : option.trim();
            if (!optionValue) return null;
            const isSelected = selectedAnswers[currentQuestionIndex] === optionValue;
            return (
              <button key={`${currentQuestionIndex}-${optionValue}`} className={`border rounded-lg p-3 transition-all duration-150 ease-in-out flex items-start w-full text-left ${ isSelected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300' } ${isSubmitting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`} onClick={() => !isSubmitting && handleSelectAnswer(optionValue)} role="radio" aria-checked={isSelected} disabled={isSubmitting} >
                  <span className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center mr-3 font-medium text-sm transition-colors ${ isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-500' }`}> {optionValue.toUpperCase()} </span>
                  <span className="text-gray-700 flex-grow whitespace-pre-wrap break-words">{optionText}</span>
              </button>
            );
          })}
        </div>
        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-4 border-t border-gray-200">
          <button onClick={handlePreviousQuestion} disabled={isFirstQuestion || isSubmitting} className="flex items-center px-4 py-2 rounded-md ... disabled:bg-gray-100 ..."> <ArrowLeft className="h-4 w-4 mr-1" /> Previous </button>
          {!isLastQuestion && ( <button onClick={handleNextQuestion} disabled={isSubmitting} className="flex items-center px-4 py-2 rounded-md ... bg-blue-600 ..."> Next <ArrowRight className="h-4 w-4 ml-1" /> </button> )}
          {isLastQuestion && ( <button onClick={() => handleSubmitCallback(false)} disabled={isSubmitting} className="flex items-center px-5 py-2 rounded-md ... bg-green-600 ..." style={{minWidth: '140px'}}> {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-4 w-4 mr-1.5" />} {isSubmitting ? 'Submitting...' : 'Submit Quiz'} </button> )}
        </div>
      </div>

      {/* Question Navigator */}
      <div className="bg-white rounded-lg shadow border border-gray-100 p-4 md:p-6">
        <h3 className="font-semibold mb-3 text-gray-700">Question Navigator</h3>
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
          {quizData.questions.map((_, index) => (
            <button key={`nav-${index}`} onClick={() => setCurrentQuestionIndex(index)} disabled={isSubmitting} className={`h-9 w-9 rounded-md flex items-center justify-center ... border transition-all ... focus:ring-blue-400 ${ currentQuestionIndex === index ? 'bg-blue-600 text-white ... scale-105' : selectedAnswers[index] !== null ? 'bg-green-100 text-green-800 ... hover:bg-green-200' : 'bg-gray-100 text-gray-700 ... hover:bg-gray-200' } ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`} aria-label={`Go to question ${index + 1}`} > {index + 1} </button>
          ))}
        </div>
        {/* Final Submit Button */}
        <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
          <button onClick={() => handleSubmitCallback(false)} disabled={isSubmitting} className="flex items-center px-5 py-2 rounded-md ... bg-green-600 ..." style={{minWidth: '180px'}}> {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-4 w-4 mr-1.5" />} {isSubmitting ? 'Submitting...' : 'Submit Final Answers'} </button>
        </div>
      </div>
    </div>
  );
};

export default UserQuizAttempt;
