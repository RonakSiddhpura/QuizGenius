import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiClient } from '../../contexts/AuthContext'; // Import apiClient
import { User, Mail, Save, Clock, Award, AlertCircle, Lock, CheckCircle } from 'lucide-react';

// Reusable Loading Spinner Component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-5">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

// Reusable Error Message Component
const ErrorMessage = ({ message }) => (
  <div className="flex items-center p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
    <div>{message || 'An error occurred.'}</div>
  </div>
);

// Reusable Success Message Component
const SuccessMessage = ({ message }) => (
    <div className="flex items-center p-3 mb-4 text-sm text-green-700 bg-green-100 rounded-lg" role="alert">
      <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
      <div>{message || 'Operation successful.'}</div>
    </div>
  );


const UserProfile = () => {
  // Destructure setUser from useAuth IF you modify AuthContext to provide it
  // Otherwise, rely on refetching user data after updates
  const { user, token } = useAuth(); // Assuming token is still needed if not using global apiClient interceptor for all requests

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [stats, setStats] = useState({
    totalSubmissions: 0, // Changed from totalQuizzes for clarity
    averageScore: 0,
    bestScore: 0,
    // Removed 'completedToday' as it might not be super useful or accurate depending on timezone handling
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  // Fetch initial profile data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Fetch user stats (submissions)
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      // Use user-specific submissions endpoint for accuracy
      const response = await apiClient.get('/api/user/submissions'); // Using apiClient
      const submissions = response.data?.submissions || [];

      const validSubmissions = submissions.filter(s => s.total > 0); // Filter out invalid/incomplete total

      let averageScore = 0;
      let bestScore = 0;
      if (validSubmissions.length > 0) {
          const scores = validSubmissions.map(s => (s.score / s.total) * 100);
          averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          bestScore = Math.max(...scores);
      }

      setStats({
        totalSubmissions: submissions.length,
        averageScore: Math.round(averageScore),
        bestScore: Math.round(bestScore)
      });

    } catch (error) {
      console.error('Error fetching user stats:', error);
      setStatsError('Could not load quiz statistics.');
    } finally {
      setStatsLoading(false);
    }
  }, []); // No dependency on token needed if apiClient handles it

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // --- Profile Update ---
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!name || !email) {
        setProfileError('Name and Email cannot be empty.');
        return;
    }

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
        setProfileError('Please enter a valid email address.');
        return;
    }

    try {
      // --- !!! IMPORTANT: This endpoint needs to be created in app.py !!! ---
      const response = await apiClient.put('/api/user/profile', { name, email }); // Using apiClient

      setProfileSuccess('Profile updated successfully!');
      setIsEditingProfile(false);
      // Optionally: Refetch user data to update context globally, or notify user to refresh
      // For now, local state reflects change immediately.
      // Example refetch (if you modify AuthContext to expose a function like 'refreshUser'):
      // refreshUser();
    } catch (err) {
      console.error('Profile update error:', err.response?.data || err.message);
      setProfileError(err.response?.data?.error || 'Failed to update profile. Please try again.');
    }
  };

  // --- Password Change ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (newPassword.length < 6) {
        setPasswordError('New password must be at least 6 characters long.');
        return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
        setPasswordError('New password cannot be the same as the current password.');
        return;
    }

    try {
      // --- !!! IMPORTANT: This endpoint needs to be created in app.py !!! ---
      const response = await apiClient.put('/api/user/password', { // Using apiClient
        currentPassword,
        newPassword
      });

      setPasswordSuccess('Password changed successfully!');
      // Clear password fields after success
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

    } catch (err) {
        console.error('Password change error:', err.response?.data || err.message);
        setPasswordError(err.response?.data?.error || 'Failed to change password. Check your current password.');
    }
  };

  // Stat Card Component
  const StatCard = ({ icon: Icon, label, value, bgColor, iconColor }) => (
     <div className={`flex justify-between items-center p-3 ${bgColor} rounded-md`}>
       <div className="flex items-center">
         <Icon className={`h-5 w-5 ${iconColor} mr-2 flex-shrink-0`} />
         <span className="text-sm text-gray-700">{label}</span>
       </div>
       <span className="font-semibold text-sm">{value}</span>
     </div>
   );

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">My Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* --- Stats Section --- */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <div className="bg-white rounded-lg shadow border border-gray-100 p-6 h-full">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">Quiz Statistics</h2>
            {statsLoading ? (
              <LoadingSpinner />
            ) : statsError ? (
               <ErrorMessage message={statsError} />
            ) : (
              <div className="space-y-3">
                <StatCard icon={Award} label="Total Submissions" value={stats.totalSubmissions} bgColor="bg-blue-50" iconColor="text-blue-500" />
                <StatCard icon={CheckCircle} label="Average Score" value={`${stats.averageScore}%`} bgColor="bg-green-50" iconColor="text-green-500" />
                <StatCard icon={Award} label="Best Score" value={`${stats.bestScore}%`} bgColor="bg-purple-50" iconColor="text-purple-500" />
              </div>
            )}
          </div>
        </div>

        {/* --- Profile & Password Section --- */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          <div className="bg-white rounded-lg shadow border border-gray-100 p-6">

            {/* Profile Form */}
            <form onSubmit={handleUpdateProfile}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-700">Profile Information</h2>
                <button
                  type="button" // Important: prevent form submission
                  onClick={() => {
                      setIsEditingProfile(!isEditingProfile);
                      setProfileError(''); // Clear errors on toggle
                      setProfileSuccess('');
                      // Reset fields if canceling edit
                      if (isEditingProfile && user) {
                          setName(user.name || '');
                          setEmail(user.email || '');
                      }
                  }}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {isEditingProfile ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>

              {profileError && <ErrorMessage message={profileError} />}
              {profileSuccess && <SuccessMessage message={profileSuccess} />}

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="profile-name">
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
                  <input
                    id="profile-name"
                    type="text"
                    className={`pl-10 w-full p-2 border rounded-md transition ${!isEditingProfile ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isEditingProfile}
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="profile-email">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
                  <input
                    id="profile-email"
                    type="email"
                    className={`pl-10 w-full p-2 border rounded-md transition ${!isEditingProfile ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isEditingProfile}
                    required
                  />
                </div>
              </div>

              {isEditingProfile && (
                <div className="flex justify-end mt-4">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Save className="inline-block h-4 w-4 mr-1.5" />
                    Save Changes
                  </button>
                </div>
              )}
            </form>

            {/* Divider */}
            <hr className="my-8 border-gray-200" />

            {/* Password Change Form */}
            <form onSubmit={handleChangePassword}>
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Change Password</h3>

                {passwordError && <ErrorMessage message={passwordError} />}
                {passwordSuccess && <SuccessMessage message={passwordSuccess} />}

                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="current-password">
                    Current Password
                  </label>
                  <div className="relative">
                     <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
                     <input
                        id="current-password"
                        type="password"
                        className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                     />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="new-password">
                            New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
                            <input
                                id="new-password"
                                type="password"
                                className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength="6"
                            />
                        </div>
                     </div>
                     <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1" htmlFor="confirm-password">
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5 pointer-events-none" />
                            <input
                                id="confirm-password"
                                type="password"
                                className="pl-10 w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength="6"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    type="submit"
                    className="bg-slate-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                  >
                    Update Password
                  </button>
                </div>
              </form>
          </div>
        </div> {/* End Profile & Password Column */}
      </div> {/* End Grid */}
    </div> /* End Container */
  );
};

export default UserProfile;