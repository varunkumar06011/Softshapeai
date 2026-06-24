import React, { useState } from 'react';
import { User, Mail, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';

const StepOwner = ({ data, onChange, onNext, onBack }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const isValid =
    data.name.length >= 2 &&
    data.email.includes('@') &&
    data.password.length >= 8 &&
    data.password === data.confirmPassword;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <User size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Owner Account</h2>
        <p className="text-gray-500">Create your admin account</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Your Name *
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
            placeholder="e.g., John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Email Address *
          </label>
          <div className="relative">
            <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="email"
              value={data.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="e.g., owner@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Password *
          </label>
          <div className="relative">
            <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={data.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-[#E53935] focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Must be at least 8 characters</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Confirm Password *
          </label>
          <div className="relative">
            <ShieldCheck size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={data.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="Re-enter password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-[#E53935] focus:outline-none"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {data.confirmPassword && data.password !== data.confirmPassword && (
            <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            isValid
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepOwner;
