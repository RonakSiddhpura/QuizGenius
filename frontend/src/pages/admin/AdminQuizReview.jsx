// src/pages/admin/AdminQuizReview.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios'; // Using axios directly
import toast from 'react-hot-toast';
import {
    Loader2,
    Check,
    X,
    Calendar,
    RefreshCw,
    Save,
    AlertTriangle,
    ArrowLeft,
    Trash2,
    Info,
    Clock
} from 'lucide-react';

// --- Helper Functions ---

const getApiBaseUrl = () => {
    // VITE_API_BASE_URL should be 'http://localhost:5000' (NO /api)
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
};

const getAuthHeaders = () => {
    // Fetches the auth token from localStorage
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("Auth token missing");
        toast.error("Authentication error. Please log in.");
        // Throwing error is important for React Query/callers to know
        throw new Error("Authentication token not found.");
    }
    return { Authorization: `Bearer ${token}` };
};

// Helper to safely extract ISO string from various date inputs
const getIsoStringFromDateInput = (dateInput) => {
    if (!dateInput) return null;
    if (typeof dateInput === 'object' && dateInput !== null && dateInput.$date && typeof dateInput.$date === 'string') {
        if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput.$date)) { return dateInput.$date; }
        else { console.warn("Invalid $date value:", dateInput.$date); return null; }
    } else if (typeof dateInput === 'string') {
        if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput)) { return dateInput; }
        else { console.warn("Received non-ISO string:", dateInput); return null; }
    } else if (dateInput instanceof Date) {
        try { return dateInput.toISOString(); }
        catch (e) { console.error("Error converting Date to ISO string:", e); return null; }
    }
    console.warn("Received unexpected date format:", dateInput); return null;
};

const formatDisplayDateTime = (dateInput) => {
    const isoString = getIsoStringFromDateInput(dateInput);
    if (!isoString) return 'Not Set';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return new Intl.DateTimeFormat(navigator.language || 'en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(date);
    } catch (e) { console.error("Error formatting date:", isoString, e); return 'Invalid Date'; }
};

const formatForDateTimeLocalInput = (dateInput) => {
    const isoString = getIsoStringFromDateInput(dateInput);
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    } catch (e) { console.error("Error formatting for input:", isoString, e); return ''; }
};

// --- Sub-Components ---

const DetailItem = ({ label, value, children }) => (
    <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <div className="mt-0.5 text-gray-800 text-sm">{children || value || <span className="text-gray-400 italic">N/A</span>}</div>
    </div>
);

const QuestionReviewCard = ({ question, index, onRemove, disabled }) => {
    const correctLetter = question.correct_answer?.toLowerCase();

    return (
        <div className="border border-gray-200 rounded-lg p-4 bg-white transition-shadow duration-150 hover:shadow-sm">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold mb-3 text-gray-800 break-words">
                        {index + 1}. {question.question || '[No Question Text]'}
                    </p>
                    <div className="space-y-2 text-sm">
                        {(question.options || []).map((option, optIndex) => { // Added default empty array
                            const match = option.match(/^\s*([a-d])[\)\.\s]\s*(.*)/s);
                            const letter = match ? match[1].toLowerCase() : String.fromCharCode(97 + optIndex);
                            const text = match ? match[2].trim() : option.trim();
                            const isCorrect = letter === correctLetter;

                            return (
                                <div
                                    key={optIndex}
                                    className={`p-2 rounded border flex items-start text-left ${
                                        isCorrect ? 'bg-green-50 border-green-300 text-green-900 font-medium ring-1 ring-green-200' : 'bg-gray-50 border-gray-200 text-gray-700'
                                    }`}
                                >
                                    <span className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded-full border text-xs flex items-center justify-center mr-2.5 font-bold ${
                                        isCorrect ? 'bg-green-600 text-white border-green-700' : 'bg-white border-gray-400 text-gray-600'
                                    }`}>
                                        {letter.toUpperCase()}
                                    </span>
                                    <span className="whitespace-pre-wrap break-words flex-1">{text || '[Empty Option]'}</span>
                                </div>
                            );
                        })}
                         {(!question.options || question.options.length === 0) && (
                            <p className="text-xs text-red-500 italic">No options found for this question.</p>
                         )}
                    </div>
                </div>
                <button
                    onClick={onRemove}
                    className="text-red-500 hover:text-red-700 focus:outline-none p-1.5 rounded-full hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 flex-shrink-0"
                    title="Remove this question"
                    disabled={disabled}
                    aria-label={`Remove question ${index + 1}`}
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};


// --- Main Component: AdminQuizReview ---
const AdminQuizReview = () => {
    const params = useParams();
    const quizId = String(params.quizId || ''); // Ensure quizId is always a string
    const navigate = useNavigate();

    // State declarations
    const [loading, setLoading] = useState(true);
    const [quiz, setQuiz] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [removedIndices, setRemovedIndices] = useState(new Set());
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleData, setScheduleData] = useState({ start: '', duration: '' });
    const [fetchError, setFetchError] = useState(null);

    useEffect(() => { console.log(">>> DEBUG (Effect): quizId from useParams:", quizId, "(Type:", typeof quizId, ")"); }, [quizId]);

    // Fetch Quiz Data Function
    const fetchQuizData = useCallback(async (idToFetch) => {
        if (!idToFetch || typeof idToFetch !== 'string' || idToFetch.length < 5) {
            const errorMsg = `Invalid Quiz ID received: ${idToFetch}`;
            setFetchError(errorMsg); toast.error(errorMsg); setLoading(false); setQuiz(null); return;
        }
        setLoading(true); setFetchError(null);
        console.log(`>>> Fetching data for quiz ID: ${idToFetch}`);
        try {
            const headers = getAuthHeaders();
            const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/${idToFetch}`;
            console.log(">>> Making API call to URL:", apiUrl);
            const response = await axios.get(apiUrl, { headers });
            const fetchedQuiz = response.data;
            console.log("Fetched quiz data:", fetchedQuiz);

            setQuiz(fetchedQuiz);
            setQuestions((fetchedQuiz.questions || []).map((q, i) => ({ ...q, question_number: q.question_number ?? i + 1 })));
            setRemovedIndices(new Set());
            setScheduleData({
                start: formatForDateTimeLocalInput(fetchedQuiz.scheduled_datetime),
                duration: fetchedQuiz.duration_minutes || ''
            });
        } catch (err) {
            console.error("Error fetching quiz:", err); console.log(">>> DEBUG: Error response data:", err.response?.data);
            const status = err?.response?.status; let errorMsg = err.response?.data?.error || err.message || 'Failed load quiz.';
            if (status === 400 && errorMsg.toLowerCase().includes("invalid quiz id")) { errorMsg = "Invalid Quiz ID format."; }
            else if (status === 401 || status === 403 || err.message === "Authentication token not found.") { errorMsg = 'Auth failed...'; setTimeout(() => navigate("/login", { replace: true }), 2000); }
            else if (status === 404) { errorMsg = 'Quiz not found.'; }
            toast.error(errorMsg); setFetchError(errorMsg); setQuiz(null);
        } finally { setLoading(false); }
    }, [navigate]);

    // Effect to trigger fetch
    useEffect(() => {
        console.log(">>> DEBUG (useEffect trigger): quizId changed to:", quizId, "(Type:", typeof quizId, ")");
        if (quizId && typeof quizId === 'string' && quizId.length > 5) { fetchQuizData(quizId); }
        else if (quizId) { const errorMsg = `Invalid quiz ID format: ${quizId}`; console.error(errorMsg); setFetchError(errorMsg); toast.error(errorMsg); setLoading(false); setQuiz(null); }
        else { const errorMsg = "Quiz ID missing."; console.error(errorMsg); setFetchError(errorMsg); toast.error(errorMsg); setLoading(false); setQuiz(null); }
    }, [quizId, fetchQuizData]);


    // --- Action Handlers ---
    const handleRemoveQuestion = useCallback((indexToRemove) => {
        const questionTextSnippet = questions[indexToRemove]?.question?.slice(0, 30) || `Question ${indexToRemove + 1}`;
        setQuestions(prev => prev.filter((_, i) => i !== indexToRemove));
        setRemovedIndices(prev => new Set(prev).add(indexToRemove));
        toast(`Removed: "${questionTextSnippet}...". Regenerate to replace.`, { duration: 3000, icon: '🗑️' });
    }, [questions]);

    const handleRegenerateQuestions = useCallback(async () => {
        if (!quizId || typeof quizId !== 'string') return toast.error("Invalid Quiz ID.");
        const countToRegen = removedIndices.size; if (countToRegen === 0) return toast.error("No questions removed."); if (!quiz) return toast.error("Quiz data error.");
        setIsRegenerating(true); const tId=toast.loading(`Regenerating ${countToRegen}...`);
        try {
            const headers = getAuthHeaders(); const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/regenerate`; console.log(">>> DEBUG: Regenerate call to:", apiUrl);
            const response = await axios.post(apiUrl, { quiz_id: quizId, count: countToRegen }, { headers });
            const newQ = response.data.regenerated_questions||[]; const updatedQ = [...questions,...newQ].map((q,i)=>({...q, question_number:i+1}));
            setQuestions(updatedQ); setRemovedIndices(new Set()); toast.success(`Regenerated ${newQ.length}. Save Review.`,{id:tId}); if(newQ.length < countToRegen) toast.info(`Note: Fewer generated (${newQ.length}/${countToRegen}).`,{duration:5000});
        } catch(err) { console.error("Regen err:",err); toast.error(err?.response?.data?.error||'Failed regen.',{id:tId}); } finally { setIsRegenerating(false); }
    }, [quizId, removedIndices, questions, quiz]);

    const handleSaveReview = useCallback(async () => {
        if (!quizId || typeof quizId !== 'string') return toast.error("Invalid Quiz ID.");
        const qSave = questions.map((q,i)=>({...q, question_number:i+1})); if(qSave.length === 0 && quiz?.questions?.length>0) toast.error('Warn: Saving 0 questions.'); if(!quiz) return toast.error("Quiz data error.");
        setIsSaving(true); const tId=toast.loading("Saving...");
        try {
            const headers = getAuthHeaders(); const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/review`; console.log(">>> DEBUG: Save review call to:", apiUrl);
            await axios.post(apiUrl, { quiz_id: quizId, questions: qSave, status: quiz.status==='draft'?'reviewed':quiz.status }, { headers });
            setQuiz(prev=>({...prev, status:prev.status==='draft'?'reviewed':prev.status, questions:qSave, num_mcqs_generated:qSave.length})); setQuestions(qSave); setRemovedIndices(new Set()); toast.success('Review saved.',{id:tId});
        } catch(err) { console.error("Save err:",err); toast.error(err?.response?.data?.error||'Failed save.',{id:tId}); } finally { setIsSaving(false); }
    }, [quizId, questions, quiz]);

    const handleScheduleChange = useCallback((e) => {
        const { name, value } = e.target; setScheduleData(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleScheduleQuiz = useCallback(async () => {
        if (!quizId || typeof quizId !== 'string') return toast.error("Invalid Quiz ID.");
        // Validation
        if (!scheduleData.start) return toast.error('Start date/time required.'); const duration = parseInt(scheduleData.duration, 10); if (isNaN(duration) || duration <= 0) return toast.error('Valid duration required.'); let startDate; try { startDate = new Date(scheduleData.start); if (isNaN(startDate.getTime())) throw new Error(); } catch { return toast.error('Invalid start date format.'); } const now = new Date(); const minStart = new Date(now.getTime() + 1*60*1000); if (startDate <= minStart) return toast.error(`Start time >= 2 min ahead.`); if (questions.length === 0) return toast.error('No questions.'); const allowed = ['draft', 'reviewed', 'scheduled']; if (!quiz || !allowed.includes(quiz.status)) return toast.error(`Cannot schedule status '${quiz?.status}'.`);

        setIsScheduling(true); const tId=toast.loading("Scheduling...");
        try {
            const payload = { quiz_id: quizId, scheduled_datetime: startDate.toISOString(), duration_minutes: duration };
            const headers = getAuthHeaders(); const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/schedule`; console.log(">>> DEBUG: Schedule call:", apiUrl, payload);
            const response = await axios.post(apiUrl, payload, { headers });
            toast.success(response.data?.message||'Scheduled!', {id:tId, duration:3000});
            setQuiz(prev=>({...prev, status:'scheduled', scheduled_datetime: response.data?.scheduled_datetime_utc, duration_minutes: response.data?.duration_minutes, end_datetime: response.data?.end_datetime_utc}));
            setScheduleData({start: formatForDateTimeLocalInput(response.data?.scheduled_datetime_utc), duration: response.data?.duration_minutes || ''});
            setTimeout(() => { navigate('/admin/quizzes'); }, 2500);
        } catch (err) { console.error("Schedule err:",err); toast.error(err?.response?.data?.error||'Failed schedule.',{id:tId}); setIsScheduling(false); }
    }, [quizId, scheduleData, questions, quiz, navigate]);


    // --- Render Logic ---

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                <p className="ml-4 text-gray-600">Loading Quiz Details...</p>
            </div>
        );
     }

    if (fetchError || !quiz) {
        return (
            <div className="text-center p-8 max-w-lg mx-auto">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-700 mb-2">Error Loading Quiz</h2>
                <p className="mt-2 text-red-600 bg-red-50 p-3 rounded border border-red-200">{fetchError || 'Quiz data could not be loaded.'}</p>
                <Link to="/admin/quizzes" className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Quizzes List
                </Link>
            </div>
        );
    }

    // Derive state after checks
    const canSchedule = quiz && ['draft', 'reviewed', 'scheduled'].includes(quiz.status);
    const removedCount = removedIndices.size;
    const isAnyActionLoading = isSaving || isScheduling || isRegenerating;

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Back Link & Header */}
                <div className='mb-4'>
                    <Link to="/admin/quizzes" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:underline mb-1 transition-colors">
                        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Quizzes List
                    </Link>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Review Quiz</h1>
                </div>

                {/* Action Buttons Row */}
                <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 mb-4 bg-gray-50 p-3 rounded-lg border sticky top-0 z-10 shadow-sm">
                     <button
                         onClick={handleSaveReview}
                         disabled={isAnyActionLoading}
                         className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center transition"
                         style={{ minWidth: '130px' }}
                     >
                         {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                         {isSaving ? 'Saving...' : 'Save Review'}
                     </button>
                     <button
                         onClick={handleRegenerateQuestions}
                         disabled={isAnyActionLoading || removedCount === 0}
                         className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center transition"
                         style={{ minWidth: '160px' }}
                         title={removedCount === 0 ? "Remove questions first to enable regeneration" : "Regenerate removed questions"}
                     >
                         {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                         Regenerate ({removedCount})
                     </button>
                </div>

                {/* Quiz Details */}
                 <div className="bg-white rounded-lg shadow p-5 sm:p-6 border border-gray-200">
                     <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700 border-b pb-3">Quiz Details</h2>
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 text-sm">
                         <DetailItem label="Topic" value={quiz.topic} />
                         <DetailItem label="Type" value={quiz.type || 'General Quiz'} />
                         <DetailItem label="Difficulty" value={quiz.difficulty} />
                         <DetailItem label="Language" value={quiz.language} />
                         <DetailItem label="Status">
                              <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${ quiz.status === 'scheduled' ? 'bg-green-100 text-green-700' : quiz.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : quiz.status === 'reviewed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700' }`}>
                                  {quiz.status?.charAt(0).toUpperCase() + quiz.status?.slice(1) || 'Unknown'}
                              </span>
                         </DetailItem>
                         <DetailItem label="Questions">
                            <span className="font-medium">{questions.length}</span>
                            <span className="text-xs text-gray-500 ml-1">(Orig: {quiz.questions?.length ?? 'N/A'})</span>
                         </DetailItem>
                          <DetailItem label="Set Duration">
                             {quiz.duration_minutes ? `${quiz.duration_minutes} min` : <span className="text-gray-400 italic">Not set</span>}
                          </DetailItem>

                         {/* Display Current Schedule */}
                         {(quiz.scheduled_datetime) && (
                             <div className="col-span-2 md:col-span-3 lg:col-span-4 mt-2 pt-3 border-t border-gray-100">
                                 <p className="text-gray-500 font-medium mb-1 text-xs uppercase tracking-wide">Current Schedule</p>
                                 <div className="flex flex-wrap gap-x-4 gap-y-1">
                                     <p className="text-gray-700 flex items-center">
                                         <Calendar size={14} className="mr-1.5 text-green-600 flex-shrink-0"/>
                                         <span className="font-semibold text-gray-600 mr-1">Start:</span> {formatDisplayDateTime(quiz.scheduled_datetime)}
                                     </p>
                                     {quiz.duration_minutes && quiz.scheduled_datetime && (
                                          <p className="text-gray-700 flex items-center">
                                             <Clock size={14} className="mr-1.5 text-red-600 flex-shrink-0"/>
                                             <span className="font-semibold text-gray-600 mr-1">Ends Approx:</span>
                                             {formatDisplayDateTime(new Date(new Date(getIsoStringFromDateInput(quiz.scheduled_datetime)).getTime() + quiz.duration_minutes * 60000))}
                                             <span className='text-xs text-gray-500 ml-1'>({quiz.duration_minutes} min)</span>
                                          </p>
                                     )}
                                 </div>
                             </div>
                         )}
                    </div>
                </div>

                {/* Review Questions Section */}
                 <div className="bg-white rounded-lg shadow p-5 sm:p-6 border border-gray-200">
                      <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700 border-b pb-3">Review Questions ({questions.length})</h2>
                      {questions.length === 0 ? (
                          <div className="text-center py-6">
                              <AlertTriangle className="mx-auto h-10 w-10 text-orange-400 mb-3"/>
                              <p className="text-gray-600 font-medium">No Questions Available</p>
                              <p className="text-sm text-gray-500 mt-1">
                                 {removedCount > 0 ? `You have marked ${removedCount} question(s) for removal. Use 'Regenerate' to get replacements.` : 'This quiz currently has no questions.'}
                              </p>
                          </div>
                      ) : (
                          <div className="space-y-5">
                              {questions.map((q, index) => (
                                  <QuestionReviewCard
                                      key={q._id || `q-${index}-${q.question?.slice(0,10)}`}
                                      question={q}
                                      index={index}
                                      onRemove={() => handleRemoveQuestion(index)}
                                      disabled={isAnyActionLoading}
                                  />
                              ))}
                          </div>
                      )}
                 </div>

                {/* Schedule Quiz Section */}
                 {canSchedule && (
                     <div className="bg-white rounded-lg shadow p-5 sm:p-6 border border-gray-200">
                         <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700 border-b pb-3">
                             {quiz.status === 'scheduled' ? 'Update Schedule' : 'Schedule Quiz'}
                         </h2>
                         {/* Info messages */}
                         {quiz.status === 'scheduled' && ( <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-md text-sm text-green-800 shadow-sm flex items-start"><Info size={16} className="mr-2 mt-0.5 flex-shrink-0 text-green-600"/><span>This quiz is currently scheduled. Updating the start time or duration will reschedule it.</span></div> )}
                         {quiz.status === 'draft' && ( <div className="mb-4 p-3 bg-yellow-50 border border-yellow-100 rounded-md text-sm text-yellow-800 shadow-sm flex items-start"><Info size={16} className="mr-2 mt-0.5 flex-shrink-0 text-yellow-600"/><span>Scheduling will automatically mark this quiz as 'Reviewed' and ready for users.</span></div> )}

                         {/* Inputs for Start Date and Duration */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                             <div className="md:col-span-2">
                                 <label className="block text-gray-700 mb-1 font-medium text-sm" htmlFor="start-datetime"> Start Date & Time <span className="text-red-500">*</span> </label>
                                 <input type="datetime-local" id="start-datetime" name="start" value={scheduleData.start} onChange={handleScheduleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm shadow-sm disabled:bg-gray-100" min={formatForDateTimeLocalInput(new Date())} required disabled={isAnyActionLoading} />
                                 <p className="text-xs text-gray-500 mt-1">Quiz becomes available (Your local time).</p>
                             </div>
                             <div>
                                 <label className="block text-gray-700 mb-1 font-medium text-sm" htmlFor="duration"> Duration (minutes) <span className="text-red-500">*</span> </label>
                                 <input type="number" id="duration" name="duration" value={scheduleData.duration} onChange={handleScheduleChange} min="1" step="1" placeholder="e.g., 30" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm shadow-sm disabled:bg-gray-100" required disabled={isAnyActionLoading} />
                                 <p className="text-xs text-gray-500 mt-1">How long the quiz stays open after start.</p>
                             </div>
                         </div>

                         <div className="flex justify-end">
                             <button
                                 onClick={handleScheduleQuiz}
                                 disabled={isAnyActionLoading || !scheduleData.start || !scheduleData.duration || parseInt(scheduleData.duration, 10) <= 0 || questions.length === 0}
                                 className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center transition"
                                 style={{ minWidth: '180px' }}
                                 title={questions.length === 0 ? "Cannot schedule without questions" : (!scheduleData.start || !scheduleData.duration || parseInt(scheduleData.duration, 10) <= 0) ? "Start time & positive duration required" : ""}
                             >
                                 {isScheduling ? ( <Loader2 className="h-4 w-4 animate-spin" /> ) : ( <Calendar className="h-4 w-4 mr-1.5" /> )}
                                 {isScheduling ? 'Scheduling...' : (quiz.status === 'scheduled' ? 'Update Schedule' : 'Schedule Quiz')}
                             </button>
                         </div>
                     </div>
                 )}
                 {!canSchedule && ( <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 text-sm"><AlertTriangle className="inline h-5 w-5 mr-2" /> Scheduling is unavailable for quizzes with status '<strong>{quiz.status}</strong>'.</div> )}
            </div>
        </div>
    );
};

export default AdminQuizReview;