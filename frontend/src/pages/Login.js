import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { Package, MessageCircle, Mail, Globe } from 'lucide-react';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage, LoadingInline } from '../components/LoadingSpinner';
import { testConnection } from '../services/api';

export const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const { login, isAuthenticated } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setConnectionStatus('Testing...');
    const result = await testConnection();
    setConnectionStatus(result);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary-100">
            <Package className="h-6 w-6 text-primary-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Wholesale & Retail POS System
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                autoComplete="email"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                type="password"
                autoComplete="current-password"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Sign in
            </LoadingButton>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              Demo credentials: admin@pos.com / admin123
            </p>
            
            {/* Connection Test Section */}
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={handleTestConnection}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Test Backend Connection
              </button>
              
              {connectionStatus && (
                <div className="mt-2 text-xs">
                  {connectionStatus === 'Testing...' ? (
                    <span className="text-yellow-600">Testing connection...</span>
                  ) : connectionStatus.success ? (
                    <span className="text-green-600">✅ Backend connected successfully!</span>
                  ) : (
                    <div className="text-red-600">
                      <div>❌ Backend connection failed</div>
                      <div className="text-xs mt-1">
                        URL: {connectionStatus.url}
                      </div>
                      <div className="text-xs">
                        Error: {connectionStatus.error}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Developer Support Section */}
            <div className="border-t pt-4 mt-4">
              <p className="text-xs text-gray-500 mb-2">
                Need Help?
              </p>
              <div className="flex flex-col items-center space-y-1">
                <a 
                  href="mailto:support@wisorsconsulting.com" 
                  className="text-xs text-gray-600 hover:text-gray-800 underline flex items-center"
                >
                  <Mail className="w-3 h-3 mr-1 text-blue-600" /> support@wisorsconsulting.com
                </a>
                <a 
                  href="https://wa.me/923166464649" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-600 hover:text-gray-800 underline flex items-center"
                >
                  <MessageCircle className="w-3 h-3 mr-1 text-[#25D366]" /> WhatsApp: +92 316 64 64 64 9
                </a>
                <a 
                  href="https://wisorsconsulting.com" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-600 hover:text-gray-800 underline flex items-center"
                >
                  <Globe className="w-3 h-3 mr-1 text-blue-600" /> wisorsconsulting.com
                </a>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
