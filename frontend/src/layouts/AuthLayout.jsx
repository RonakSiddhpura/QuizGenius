
// src/layouts/AuthLayout.jsx
import { Outlet, Link } from 'react-router-dom'; // Added Link
import { Book } from "lucide-react"; // Assuming Book is your logo icon

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8"> {/* Added subtle gradient */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Link the logo back to a relevant page, e.g., login */}
        <Link to="/login" className="flex justify-center items-center group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-full">
          <Book size={48} className="text-indigo-600 group-hover:text-indigo-700 transition-colors" aria-hidden="true" />
          <span className="sr-only">QuizGenius Home</span>
        </Link>
        <h1 className="mt-4 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          QuizGenius
        </h1>
         {/* Optional: Add a small tagline */}
         <p className="mt-2 text-center text-sm text-gray-600">
            Test your knowledge.
         </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-200"> {/* Added border */}
          {/* Outlet renders Login or Register component */}
          <Outlet />
        </div>
         {/* Optional: Add footer links if needed */}
         {/* <div className="mt-6 text-center text-sm">
            <Link to="/privacy" className="font-medium text-indigo-600 hover:text-indigo-500"> Privacy Policy </Link>
         </div> */}
      </div>
    </div>
  );
}