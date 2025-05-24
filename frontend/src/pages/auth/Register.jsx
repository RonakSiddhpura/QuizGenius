// src/pages/auth/Register.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast'; // <-- Import toast
import { Eye, EyeOff, UserPlus, AlertCircle, Loader2 } from 'lucide-react';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [formErrors, setFormErrors] = useState({}); // Keep for client-side errors
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep authError for potential field highlighting, but display via toast
  const { register, error: authError, setError: setAuthError, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

   // Clear context error on mount
   useEffect(() => {
    setAuthError(null);
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
    }
    if (authError) {
        setAuthError(null); // Clear general API error state on input change
    }
  };

  // Client-side validation function (modified to maybe not set state directly)
  const validateForm = () => {
    const { name, email, password, confirmPassword } = formData;
    const errors = {}; // Local errors for this validation run

    if (!name.trim()) errors.name = 'Name is required';
    if (!email.trim()) {
        errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
        errors.email = 'Please enter a valid email address';
    }
    if (!password) {
        errors.password = 'Password is required';
    } else if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters long';
    }
    if (!confirmPassword) {
        errors.confirmPassword = 'Please confirm your password';
    } else if (password && password !== confirmPassword) {
      if (!errors.password) { // Only show if password itself is okay
         errors.confirmPassword = 'Passwords do not match';
      }
    }
    setFormErrors(errors); // Update state to show inline errors
    return Object.keys(errors).length === 0; // Return true if valid
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null); // Clear previous API error state

    // Run client-side validation first
    if (!validateForm()) {
        // Optionally notify user about client errors, e.g., focus first error field
        // Or just rely on the inline error messages below inputs.
        // Example: toast.warning("Please fix the errors in the form.");
      return;
    }

    setIsSubmitting(true);

    // Call register function from context
    const result = await register(formData.name, formData.email, formData.password);
    setIsSubmitting(false);

    if (result.success && result.user) {
        console.log("Registration successful, navigating...");
        // Optional: Success toast
        // toast.success("Registration successful! Welcome.");
        const targetPath = result.user.role === 'admin' ? '/admin' : '/user';
        navigate(targetPath, { replace: true });
    } else if (result.error) {
        // --- Show API error (e.g., "Email already exists") as a toast ---
        toast.error(result.error);
        // The authError state in context is also set, possibly highlighting fields
    } else {
        // Fallback generic error toast
        toast.error("An unknown registration error occurred.");
    }
  };

  if (isAuthLoading && !isSubmitting) {
     return <div className="pt-10 text-center">Loading...</div>;
  }

  return (
    <form className="space-y-5 animate-fade-in" onSubmit={handleSubmit} noValidate>
      {/* General Auth Error Display Removed - Handled by toast */}
      {/* {authError && ( ... )} */}

      {/* Name Input */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={formData.name}
          onChange={handleChange}
          // Highlight on specific client error OR general API error
          className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition duration-150 ease-in-out ${
              formErrors.name || authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
          }`}
          aria-invalid={!!formErrors.name || !!authError}
          aria-describedby={formErrors.name ? 'name-error' : undefined}
        />
        {/* Display client-side validation error inline */}
        {formErrors.name && <p id="name-error" className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
      </div>

       {/* Email Input */}
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
          value={formData.email}
          onChange={handleChange}
          className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition duration-150 ease-in-out ${
              formErrors.email || authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
          }`}
          aria-invalid={!!formErrors.email || !!authError}
          aria-describedby={formErrors.email ? 'email-error' : undefined}
        />
         {formErrors.email && <p id="email-error" className="mt-1 text-xs text-red-600">{formErrors.email}</p>}
      </div>

       {/* Password Input */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password (min. 6 characters)
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength="6"
            value={formData.password}
            onChange={handleChange}
            className={`appearance-none block w-full px-3 py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm pr-10 transition duration-150 ease-in-out ${
                formErrors.password || authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
            }`}
            aria-invalid={!!formErrors.password || !!authError}
            aria-describedby={formErrors.password ? 'password-error' : undefined}
          />
           <button
                type="button"
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-r-md"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
            >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
        </div>
         {formErrors.password && <p id="password-error" className="mt-1 text-xs text-red-600">{formErrors.password}</p>}
      </div>

       {/* Confirm Password Input */}
        <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={formData.confirmPassword}
          onChange={handleChange}
          className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 sm:text-sm transition duration-150 ease-in-out ${
              formErrors.confirmPassword || authError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
          }`}
          aria-invalid={!!formErrors.confirmPassword || !!authError}
          aria-describedby={formErrors.confirmPassword ? 'confirmPassword-error' : undefined}
        />
         {formErrors.confirmPassword && <p id="confirmPassword-error" className="mt-1 text-xs text-red-600">{formErrors.confirmPassword}</p>}
      </div>

      {/* Submit Button */}
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition duration-150 ease-in-out"
        >
           {isSubmitting ? (
             <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Registering...
             </>
          ) : (
            <>
                <UserPlus className="mr-2 h-5 w-5" />
                Register
            </>
          )}
        </button>
      </div>

       <div className="text-sm text-center !mt-6">
        <p className="text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 rounded">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}