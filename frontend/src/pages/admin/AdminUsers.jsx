

import React, { useState, useEffect } from 'react'; // Added useEffect for potential future use
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Trash2, Edit, Search, UserPlus, Check, X, AlertTriangle, Loader, BookOpen // Added icons
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast'; // For notifications

// Helper function to get base URL from environment variables
const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_BASE_URL || ''; // Default to empty string if not set
};

// Helper function to get Auth Headers
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("Auth token is missing from localStorage.");
        // Redirect or throw - throwing allows React Query's onError to handle it
        throw new Error("Authentication token not found.");
    }
    return { Authorization: `Bearer ${token}` };
};


const AdminUsers = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user'
  });
  const [mutationError, setMutationError] = useState(null); // Modal errors
  // Removed deleteError state, will use toast directly

  const ITEMS_PER_PAGE = 10;

  // Fetch users query
  const { data: usersData, isLoading, error: fetchError, isFetching } = useQuery({
    queryKey: ['adminUsers', page, search], // Query key includes pagination and search
    queryFn: async () => {
      try {
          const params = new URLSearchParams({
              page: page.toString(),
              limit: ITEMS_PER_PAGE.toString(),
              search: search.trim() // Trim search term
          });
          const response = await axios.get(`${getApiBaseUrl()}/api/admin/users?${params.toString()}`, {
            headers: getAuthHeaders()
          });

          // Validate response structure
          if (!response.data || typeof response.data.users === 'undefined' || typeof response.data.total_pages === 'undefined') {
             console.error("Unexpected API response structure:", response.data);
             throw new Error("Received invalid data from server.");
          }
          // Ensure users is always an array
          const users = Array.isArray(response.data.users) ? response.data.users : [];
          return { ...response.data, users }; // Return validated data

      } catch (err) {
          console.error("Error fetching users:", err);
           // Re-throw with a user-friendly message if possible
           const errorMsg = err.message === "Authentication token not found."
                ? "Authentication failed. Please log in again."
                : err.response?.data?.error || err.message || "Failed to load users.";
           // Don't toast here, let the component render the error state
          throw new Error(errorMsg);
      }
    },
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false, // Optional: disable
    retry: 1, // Retry once
  });

  // --- Mutations ---

  const commonMutationOptions = {
      onSuccess: (context) => { // Pass context if needed from onMutate
          // Invalidate and refetch the users query to show changes
          queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
          setIsModalOpen(false); // Close modal on success
          resetForm();
          setMutationError(null); // Clear modal error
          // toast.success(context?.successMessage || "Operation successful!"); // Use context for message
      },
      onError: (error, variables, context) => {
          console.error("Mutation Error:", error);
          // Set error state for the modal form
          const errorMsg = error?.response?.data?.error || error.message || context?.errorMessage || "An error occurred.";
          setMutationError(errorMsg);
          // Don't toast here, error is shown in the modal
      }
  };

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData) => axios.post(`${getApiBaseUrl()}/api/admin/users`, userData, { headers: getAuthHeaders() }),
    ...commonMutationOptions,
    onSuccess: () => { // Override onSuccess to add specific message
        commonMutationOptions.onSuccess();
        toast.success("User created successfully!");
    },
    onError: (error) => commonMutationOptions.onError(error, null, { errorMessage: "Failed to create user." })
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: (userData) => {
        const { id, ...updateData } = userData;
        // Remove password field if it's empty - don't send empty string
        if (!updateData.password?.trim()) {
            delete updateData.password;
        }
        return axios.put(`${getApiBaseUrl()}/api/admin/users/${id}`, updateData, { headers: getAuthHeaders() });
    },
    ...commonMutationOptions,
     onSuccess: () => {
        commonMutationOptions.onSuccess();
        toast.success("User updated successfully!");
    },
    onError: (error) => commonMutationOptions.onError(error, null, { errorMessage: "Failed to update user." })
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId) => axios.delete(`${getApiBaseUrl()}/api/admin/users/${userId}`, { headers: getAuthHeaders() }),
    onSuccess: (data, userId) => { // data is the response, userId is the variable passed to mutate
        toast.success(data?.data?.message || `User deleted successfully.`);
        // Invalidate queries *after* potential page adjustment
        queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
        // Check if the deleted user was the last one on the current page
        if (usersData?.users?.length === 1 && page > 1) {
            setPage(prev => prev - 1); // Go to previous page
        }
    },
    onError: (error) => {
        console.error("Error deleting user:", error);
        const errorMsg = error?.response?.data?.error || error.message || "Failed to delete user.";
        toast.error(errorMsg); // Show toast for delete errors
    }
  });

  // --- Handlers ---

  const handleSearchInput = (e) => {
      setSearch(e.target.value);
      // Optionally add debounce here if needed
      setPage(1); // Reset page on search
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setMutationError(null); // Clear previous errors
    const payload = { ...formData };

    if (isEditMode && selectedUser?.id) {
        // Basic validation for edit mode (e.g., password length if entered)
        if (payload.password && payload.password.length < 6) {
            setMutationError("New password must be at least 6 characters.");
            return;
        }
        updateUserMutation.mutate({ id: selectedUser.id, ...payload });
    } else {
        // Validation for create mode
        if (!payload.password || payload.password.length < 6) {
            setMutationError("Password is required and must be at least 6 characters.");
            return;
        }
        createUserMutation.mutate(payload);
    }
  };

  const openEditModal = (user) => {
    setIsEditMode(true);
    setSelectedUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '', // Important: Always clear password field on edit open
      role: user.role || 'user'
    });
    setMutationError(null);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setSelectedUser(null);
    resetForm();
    setMutationError(null);
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', role: 'user' });
  };

  const confirmDelete = (userId, userName) => {
      if (window.confirm(`Are you sure you want to delete user "${userName}"? This will also delete their quiz history and cannot be undone.`)) {
          deleteUserMutation.mutate(userId);
      }
  };

  const handlePageChange = (newPage) => {
      if (newPage >= 1 && newPage <= (usersData?.total_pages || 1) && newPage !== page) {
          setPage(newPage);
      }
  };

  // Format date (only date part needed here)
  const formatDisplayDate = (isoString) => {
    if (!isoString) return "N/A";
    try {
        const date = new Date(isoString);
         if (isNaN(date.getTime())) return "Invalid Date";
        return new Intl.DateTimeFormat(navigator.language || 'en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        }).format(date);
    } catch { return "Invalid Date"; }
  };

  // --- Rendering ---
  const isMutating = createUserMutation.isLoading || updateUserMutation.isLoading || deleteUserMutation.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center">
          <Users className="mr-3 h-7 w-7 text-indigo-600 flex-shrink-0" />
          User Management
        </h1>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm text-sm font-medium transition duration-150"
          disabled={isMutating} // Disable if any mutation is happening
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </button>
      </div>

       {/* Search bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 p-2.5 shadow-sm transition"
          placeholder="Search by name or email..."
          value={search}
          onChange={handleSearchInput}
          disabled={isFetching} // Disable only during fetches, not mutations
        />
      </div>

      {/* Users table Container */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        {/* Loading State */}
        {isLoading && ( // Show only on initial load
          <div className="flex justify-center items-center p-10">
            <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
            <span className="ml-3 text-gray-600">Loading Users...</span>
          </div>
        )}

        {/* Error State */}
        {fetchError && !isLoading && (
            <div className="p-6 text-center text-red-600 bg-red-50 rounded-b-lg border-t border-red-200">
               <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-2"/>
               <p className="font-medium">Error Loading Users</p>
               <p className="text-sm">{fetchError.message || 'An unexpected error occurred.'}</p>
               {fetchError.message?.includes("Authentication") && (
                   <p className="text-xs mt-2 text-gray-600">Please ensure you are logged in.</p>
               )}
            </div>
        )}

        {/* Table Display (only when not initial loading and no fetch error) */}
        {!isLoading && !fetchError && (
           <div className="overflow-x-auto relative">
                {/* Fetching overlay */}
                {isFetching && (
                   <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center z-10">
                      <Loader className="h-6 w-6 text-indigo-600 animate-spin" />
                   </div>
                )}
              <table className="min-w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3 px-6">Name</th>
                    <th scope="col" className="py-3 px-6">Email</th>
                    <th scope="col" className="py-3 px-6">Role</th>
                    <th scope="col" className="py-3 px-6 text-center">Quizzes Taken</th>
                    <th scope="col" className="py-3 px-6">Member Since</th>
                    <th scope="col" className="py-3 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Empty State */}
                  {usersData?.users?.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-6 px-6 text-center text-gray-500 italic">
                        No users found {search ? 'matching your search' : ''}.
                      </td>
                    </tr>
                  ) : (
                    // User Rows
                    usersData?.users?.map((user) => (
                      <tr key={user.id} className="bg-white border-b hover:bg-gray-50 transition-colors duration-150">
                        <td className="py-3 px-6 font-medium text-gray-900 whitespace-nowrap">{user.name}</td>
                        <td className="py-3 px-6 whitespace-nowrap">{user.email}</td>
                        <td className="py-3 px-6 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 ring-1 ring-purple-200' // Added ring
                            : 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' // Added ring
                          }`}>
                            {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                          </span>
                        </td>
                        {/* Display Quiz Count */}
                        <td className="py-3 px-6 text-center">
                          <span className="inline-flex items-center font-medium">
                             <BookOpen size={14} className="mr-1.5 text-gray-400"/>
                             {user.quiz_count ?? 0} {/* Use the quiz_count field */}
                           </span>
                        </td>
                        <td className="py-3 px-6 whitespace-nowrap">{formatDisplayDate(user.created_at)}</td>
                        <td className="py-3 px-6 text-center">
                          <div className="flex justify-center space-x-1">
                              {/* Edit Button */}
                              <button
                                onClick={() => openEditModal(user)}
                                className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-md hover:bg-indigo-100 transition-colors duration-150 disabled:text-gray-400 disabled:hover:bg-transparent"
                                title="Edit User"
                                disabled={isMutating} // Disable if any mutation is happening
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {/* Delete Button */}
                              <button
                                onClick={() => confirmDelete(user.id, user.name)}
                                className="text-red-600 hover:text-red-800 p-1.5 rounded-md hover:bg-red-100 transition-colors duration-150 disabled:text-gray-400 disabled:hover:bg-transparent"
                                title="Delete User"
                                // Disable if any mutation is happening OR if this specific user is being deleted
                                disabled={isMutating || deleteUserMutation.variables === user.id}
                              >
                                {deleteUserMutation.isLoading && deleteUserMutation.variables === user.id
                                    ? <Loader className="w-4 h-4 animate-spin"/>
                                    : <Trash2 className="w-4 h-4" />
                                }
                              </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
           </div>
        )}
      </div>

      {/* Pagination */}
      {usersData?.total_pages > 1 && !fetchError && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-4 border-t border-gray-200">
           <span className="text-sm text-gray-600 mb-2 sm:mb-0">
                Page {usersData.current_page} of {usersData.total_pages} <span className="hidden sm:inline">| Total Users: {usersData.total_users}</span>
           </span>
          <nav className="flex items-center space-x-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || isFetching || isMutating}
              className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {/* Simple page display */}
            <span className="text-sm px-3 py-1 border border-gray-300 rounded-md bg-gray-100">{page}</span>
             {/* Consider adding more complex pagination controls if many pages expected */}
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === usersData.total_pages || isFetching || isMutating}
              className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </nav>
        </div>
      )}

      {/* Create/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-out animate-fade-in"> {/* Added animation */}
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl p-6 m-4 transform transition-all duration-300 ease-out scale-100" onClick={(e) => e.stopPropagation()}> {/* Added transform */}
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h2 className="text-xl font-semibold text-gray-800">
                {isEditMode ? 'Edit User' : 'Add New User'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

             {/* Modal Error Display */}
             {mutationError && (
                 <div className="bg-red-100 border border-red-300 p-3 mb-4 rounded-md text-sm text-red-700 flex items-start">
                     <AlertTriangle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                     <span>{mutationError}</span>
                 </div>
             )}

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="name">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" id="name" name="name" value={formData.name} onChange={handleInputChange}
                  className="border border-gray-300 rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm"
                  required disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email" id="email" name="email" value={formData.email} onChange={handleInputChange}
                  className="border border-gray-300 rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm"
                  required disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="password">
                  Password <span className="text-red-500">{isEditMode ? '' : '*'}</span>
                  {isEditMode && <span className="text-xs text-gray-500"> (Leave blank to keep current)</span>}
                </label>
                <input
                  type="password" id="password" name="password" value={formData.password} onChange={handleInputChange}
                  className="border border-gray-300 rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm"
                  required={!isEditMode} minLength={6} // Always enforce minLength (backend does too)
                  disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                />
                 {/* Client-side validation hint for password length when editing */}
                 {isEditMode && formData.password && formData.password.length > 0 && formData.password.length < 6 && (
                    <p className="text-xs text-red-500 mt-1">New password must be at least 6 characters.</p>
                 )}
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="role">
                  Role
                </label>
                <select
                  id="role" name="role" value={formData.role} onChange={handleInputChange}
                  className="border border-gray-300 rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm bg-white"
                  disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-md text-sm transition duration-150"
                  disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md flex items-center justify-center text-sm transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
                  style={{ minWidth: '120px' }} // Ensure button width is consistent
                >
                  {(createUserMutation.isLoading || updateUserMutation.isLoading) ? (
                    <Loader className="w-5 h-5 animate-spin" /> // Slightly larger loader
                  ) : (
                    <>
                    <Check className="w-4 h-4 mr-1.5" />
                    {isEditMode ? 'Update User' : 'Create User'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;