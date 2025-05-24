// src/pages/auth/Login.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast'; // <-- Import toast
import { AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep authError if you want to highlight fields, but we won't display it directly
  const { login, error: authError, setError: setAuthError, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  // Clear auth error when component mounts (optional, as toast handles display)
  useEffect(() => {
    setAuthError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    // Clear the context error state if user types (optional, good practice)
    if (authError) {
      setAuthError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError(null); // Clear context error state on new attempt

    // Basic client-side validation (optional, but good)
    if (!email || !password) {
        // Use toast for client-side errors too, or keep inline messages
        toast.error("Email and password are required.");
        setIsSubmitting(false);
        return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        toast.error("Please enter a valid email address.");
        setIsSubmitting(false);
        return;
    }

    // Call the login function from AuthContext
    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success && result.user) {
      console.log("Login successful, navigating...");
      // Optional: Success toast
      // toast.success(`Welcome back, ${result.user.name}!`);

      const targetPath = result.user.role === 'admin' ? '/admin' : '/user';
      navigate(targetPath, { replace: true });
    } else if (result.error) {
      // --- Show API error as a toast ---
      toast.error(result.error);
      // AuthContext also sets authError state, which might trigger field highlighting
    } else {
       // Fallback generic error toast if result format is unexpected
       toast.error("An unknown login error occurred.");
    }
  };

  if (isAuthLoading && !isSubmitting) {
     return <div className="pt-10 text-center">Loading...</div>;
  }

  return (
    // No need for key based on error anymore if error is shown in toast
    <form className="space-y-5 animate-fade-in" onSubmit={handleSubmit} noValidate>
      {/* Error Display Area Removed - Handled by toast */}
      {/* {authError && ( ... )} */}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={handleInputChange(setEmail)}
          // Highlight field if context has error (optional visual cue)
          className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition duration-150 ease-in-out ${
              authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
          }`}
          aria-invalid={!!authError}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={handleInputChange(setPassword)}
           // Highlight field if context has error (optional visual cue)
          className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition duration-150 ease-in-out ${
              authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
          }`}
          aria-invalid={!!authError}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition duration-150 ease-in-out"
        >
          {isSubmitting ? (
             <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Signing in...
             </>
          ) : (
            'Sign in'
          )}
        </button>
      </div>

      <div className="text-sm text-center !mt-6">
        <p className="text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 rounded">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}