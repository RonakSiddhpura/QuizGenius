import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from "react-router-dom";
import {
  FileQuestion, Calendar, Edit, Clock, Filter, Loader2 as Loader,
  CheckCircle, AlertCircle, AlertTriangle, FileText, Trash2
} from 'lucide-react';
import axios from "axios";
import toast from 'react-hot-toast';

// Helper function to get base URL from environment variables
const getApiBaseUrl = () => {
    // VITE_API_BASE_URL should be 'http://localhost:5000' (NO /api)
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
};

// Helper to format date for API query parameter (DD/MM/YYYY)
const formatDateParam = (dateString) => {
    if (!dateString) return ""; 
    try {
        // Input type="date" provides YYYY-MM-DD
        const [year, month, day] = dateString.split("-");
        // Basic validation
        if (!year || !month || !day || year.length !== 4 || month.length !== 2 || day.length !== 2) {
             console.warn("Invalid date string for formatting:", dateString);
             return "";
        }
        return `${day}/${month}/${year}`; // Format as DD/MM/YYYY
    } catch (e) {
        console.error("Error formatting date param:", e);
        return "";
    }
};

// Helper to format date/time string for display
const formatDisplayDateTime = (dateInput) => {
    let isoString = null;
    // Handle {$date: ...} structure potentially coming from DB/JSON
    if (typeof dateInput === 'object' && dateInput !== null && dateInput.$date) {
        isoString = dateInput.$date;
        if (typeof isoString !== 'string') { return "Invalid Date Obj"; }
    } else if (typeof dateInput === 'string') {
        isoString = dateInput;
    } else { return "N/A"; } // Handle null/undefined

    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) { return "Invalid Date Str"; }
        return new Intl.DateTimeFormat(navigator.language || 'en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(date);
    } catch (e) { console.error("Error formatting display date:", isoString, e); return "Formatting Error"; }
};

const AdminQuizzes = () => {
  const [filters, setFilters] = useState({ from: "", to: "", status: "", topic: "" });
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10; // Items per page
  
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // React Query to fetch quiz history with pagination and filters
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["adminQuizzes", filters, currentPage],
    queryFn: async ({ queryKey }) => {
        const [_key, currentFilters, pageNum] = queryKey;
        const token = localStorage.getItem("token");
        if (!token) { throw new Error("Authentication token not found."); }

        // Construct query parameters
        const params = new URLSearchParams({
            page: pageNum.toString(),
            limit: ITEMS_PER_PAGE.toString()
        });
        const fromDate = formatDateParam(currentFilters.from);
        const toDate = formatDateParam(currentFilters.to);
        if (fromDate) params.append("from", fromDate);
        if (toDate) params.append("to", toDate);
        if (currentFilters.status) params.append("status", currentFilters.status);
        if (currentFilters.topic.trim()) params.append("topic", currentFilters.topic.trim());

        console.log("Fetching quizzes with params:", params.toString());

        try {
            // Construct URL with /api prefix
            const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/history?${params.toString()}`;
            console.log(">>> Fetching quizzes URL:", apiUrl);
            const response = await axios.get(apiUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });

            // Validate response structure
            if (!response.data || typeof response.data !== 'object') {
                throw new Error("Invalid data structure received from server.");
            }

            // Process fetched quizzes to ensure _id is a string
            const quizzesRaw = Array.isArray(response.data.quizzes) ? response.data.quizzes : [];
            const quizzesProcessed = quizzesRaw.map(quiz => {
                // Ensure _id is a string
                const stringId = (quiz._id && typeof quiz._id === 'object' && quiz._id.$oid)
                                ? quiz._id.$oid
                                : String(quiz._id || ''); // Fallback to String conversion

                // Ensure created_by is a string (optional, but good practice)
                const createdByString = (quiz.created_by && typeof quiz.created_by === 'object' && quiz.created_by.$oid)
                                ? quiz.created_by.$oid
                                : String(quiz.created_by || '');

                return {
                    ...quiz,
                    _id: stringId,
                    created_by: createdByString
                };
            });

            console.log("Processed Quizzes Data:", quizzesProcessed);

            // Return the full response object with processed quizzes and pagination info
            return {
                ...response.data, // Includes total_pages etc. from backend
                quizzes: quizzesProcessed,
                current_page: pageNum // Echo back the requested page
            };

        } catch (err) {
            console.error("Error fetching admin quizzes:", err);
            const errorMsg = err.response?.data?.error || err.message || "Failed to fetch quizzes.";
            // Let React Query handle the error state by re-throwing
            throw new Error(errorMsg);
        }
    },
    keepPreviousData: true, // Keep showing old data while fetching new page
    refetchOnWindowFocus: false, // Optional: disable
    staleTime: 5 * 60 * 1000, // Data is considered fresh for 5 minutes
    retry: 1, // Retry once on network failure
    onError: (err) => { // Optional: Show toast on error
        if (err.message === "Authentication token not found.") {
            toast.error("Authentication error. Please log in again.");
        } else {
            toast.error(`Failed to load quizzes: ${err.message}`);
        }
    }
  });

  // Handle filter input changes
  const handleFilterChange = (e) => {
      const { name, value } = e.target;
      setFilters(prevFilters => ({ ...prevFilters, [name]: value }));
      setCurrentPage(1); // Reset to page 1 when filters change
  };

  // Handle pagination changes
  const handlePageChange = (newPage) => {
     // Check bounds using total_pages from data
     if (newPage >= 1 && newPage <= (data?.total_pages || 1) && newPage !== currentPage) {
         setCurrentPage(newPage);
     }
  };

  // Open delete confirmation modal
  const openDeleteModal = (quiz) => {
    setQuizToDelete(quiz);
    setDeleteModalOpen(true);
  };

  // Close delete confirmation modal
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setQuizToDelete(null);
  };

  // Handle quiz deletion
  const handleDeleteQuiz = async () => {
    if (!quizToDelete || !quizToDelete._id) return;
    
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication token not found.");
      }
      
      const apiUrl = `${getApiBaseUrl()}/api/admin/quiz/${quizToDelete._id}`;
      await axios.delete(apiUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Quiz "${quizToDelete.topic || 'Untitled'}" has been deleted.`);
      
      // Close modal and refetch data
      closeDeleteModal();
      refetch();
      
      // If we just deleted the last item on a page, go to previous page
      if (data?.quizzes?.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    } catch (err) {
      console.error("Error deleting quiz:", err);
      const errorMsg = err.response?.data?.error || err.message || "Failed to delete quiz.";
      toast.error(`Delete failed: ${errorMsg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Function to render status badges
  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { color: "bg-gray-100 text-gray-800", icon: <Edit size={14} className="mr-1 flex-shrink-0" /> },
      reviewed: { color: "bg-purple-100 text-purple-800", icon: <FileText size={14} className="mr-1 flex-shrink-0" /> },
      scheduled: { color: "bg-blue-100 text-blue-800", icon: <Calendar size={14} className="mr-1 flex-shrink-0" /> },
      active: { color: "bg-green-100 text-green-800", icon: <CheckCircle size={14} className="mr-1 flex-shrink-0" /> },
      default: { color: "bg-yellow-100 text-yellow-800", icon: <AlertCircle size={14} className="mr-1 flex-shrink-0" /> }
    };
    const lowerStatus = typeof status === 'string' ? status.toLowerCase() : 'default';
    const config = statusMap[lowerStatus] || statusMap.default;
    const displayText = lowerStatus === 'default' ? 'Unknown' : (lowerStatus.charAt(0).toUpperCase() + lowerStatus.slice(1));
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {displayText}
      </span>
    );
  };

  // Debug log for fetched data structure
  useEffect(() => {
    if (data?.quizzes?.[0]) {
        console.log(">>> DEBUG: First quiz data structure IN STATE:", data.quizzes[0]);
        console.log(">>> DEBUG: Type of _id IN STATE:", typeof data.quizzes[0]._id, "Value:", data.quizzes[0]._id);
    }
  }, [data]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center">
          <FileQuestion className="mr-2 h-7 w-7 text-indigo-600 flex-shrink-0" /> Quiz Management
        </h1>
        <Link
          to="/admin/create-quiz"
          className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm text-sm font-medium transition duration-150"
        >
          Create New Quiz
        </Link>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex items-center text-gray-700 font-medium flex-shrink-0 mb-2 md:mb-0">
                  <Filter className="text-gray-500 mr-2" size={18} /> <span>Filters:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-grow">
                  <div>
                      <label htmlFor="topicFilter" className="block text-xs font-medium text-gray-600 mb-1">Topic</label>
                      <input type="text" id="topicFilter" name="topic" placeholder="Search by topic..." value={filters.topic} onChange={handleFilterChange} className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition" />
                  </div>
                  <div>
                      <label htmlFor="statusFilter" className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                      <select id="statusFilter" name="status" value={filters.status} onChange={handleFilterChange} className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white appearance-none" >
                          <option value="">All Statuses</option>
                          <option value="draft">Draft</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="active">Active</option>
                      </select>
                  </div>
                  <div>
                      <label htmlFor="dateFrom" className="block text-xs font-medium text-gray-600 mb-1">Created From</label>
                      <input type="date" id="dateFrom" name="from" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-indigo-500 focus:border-indigo-500" value={filters.from} onChange={handleFilterChange} max={filters.to || undefined} />
                  </div>
                  <div>
                      <label htmlFor="dateTo" className="block text-xs font-medium text-gray-600 mb-1">Created To</label>
                      <input type="date" id="dateTo" name="to" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-indigo-500 focus:border-indigo-500" value={filters.to} onChange={handleFilterChange} min={filters.from || undefined} />
                  </div>
              </div>
          </div>
      </div>

      {/* Quiz List Table Area */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        {/* Loading State Overlay */}
        {(isLoading || isFetching) && (
          <div className="relative">
            <div className="flex justify-center items-center p-10 z-20">
              <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
              <span className="ml-3 text-gray-600">Loading Quizzes...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="p-6 text-center text-red-600 bg-red-50 rounded-b-lg border-t border-red-200">
             <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-2"/>
             <p className="font-medium">Error Loading Quizzes</p>
             <p className="text-sm">{error.message || 'An unexpected error occurred.'}</p>
             {error.message?.includes("token") && (
               <p className="text-xs mt-2 text-gray-600">Please try logging out and logging back in.</p>
             )}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isFetching && !error && data?.quizzes?.length === 0 && (
          <div className="p-10 text-center text-gray-500 border-t border-gray-200">
            <FileQuestion className="mx-auto h-10 w-10 text-gray-400 mb-3"/>
            <p className="font-medium">No Quizzes Found</p>
            <p className="text-sm mt-1">Try adjusting the filters or create a new quiz.</p>
          </div>
        )}

        {/* Data Table */}
        {!isLoading && !error && data?.quizzes?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Topic & Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Questions</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled Start</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.quizzes.map((quiz) => (
                  <tr key={quiz._id} className="hover:bg-gray-50 transition-colors duration-150 align-top">
                    {/* Topic & Type */}
                    <td className="px-6 py-4 whitespace-normal">
                      <div className="text-sm font-semibold text-gray-900 break-words">{quiz.topic || 'No Topic'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{quiz.type || 'N/A'}</div>
                    </td>
                    {/* Created At */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDisplayDateTime(quiz.created_at)}</td>
                    {/* Question Count */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-700">{quiz.num_mcqs_generated ?? quiz.questions?.length ?? 'N/A'}</td>
                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(quiz.status)}</td>
                    {/* Scheduled Start */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {quiz.scheduled_datetime ? (
                        <div className="flex items-center text-blue-700">
                          <Clock className="mr-1.5 flex-shrink-0" size={14} />
                          {formatDisplayDateTime(quiz.scheduled_datetime)}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Not scheduled</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Link
                          to={`/admin/review-quiz/${quiz._id}`}
                          className="text-indigo-600 hover:text-indigo-900 hover:underline inline-flex items-center px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                          title={`Review/Schedule quiz: ${quiz.topic}`}
                        >
                          <Edit size={15} className="mr-1" /> Review
                        </Link>
                        <button
                          onClick={() => openDeleteModal(quiz)}
                          className="text-red-600 hover:text-red-900 hover:underline inline-flex items-center px-2 py-1 rounded hover:bg-red-50 transition-colors"
                          title={`Delete quiz: ${quiz.topic}`}
                        >
                          <Trash2 size={15} className="mr-1" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
             {/* Pagination Controls */}
             {data?.total_pages > 1 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600">
                     <div className="mb-2 sm:mb-0">
                        Page <span className="font-semibold">{data?.current_page ?? currentPage}</span> of <span className="font-semibold">{data?.total_pages}</span> (Total: <span className="font-semibold">{data?.total_quizzes ?? 'N/A'}</span> quizzes)
                     </div>
                     <div className="flex space-x-1">
                        <button
                           onClick={() => handlePageChange(currentPage - 1)}
                           disabled={currentPage <= 1 || isFetching}
                           className="px-3 py-1 border rounded-md bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                           Previous
                        </button>
                        <button
                           onClick={() => handlePageChange(currentPage + 1)}
                           disabled={currentPage >= data?.total_pages || isFetching}
                           className="px-3 py-1 border rounded-md bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                           Next
                        </button>
                     </div>
                 </div>
             )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Quiz</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete the quiz <span className="font-medium text-gray-800">"{quizToDelete?.topic || 'Untitled'}"</span>? 
              This action cannot be undone.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Quiz ID: {quizToDelete?._id}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteQuiz}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
              >
                {isDeleting ? (
                  <>
                    <Loader size={16} className="animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} className="mr-2" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminQuizzes;