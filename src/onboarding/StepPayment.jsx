import React, { useState, useEffect } from 'react';
import { CreditCard, Lock, CheckCircle2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { apiFetch, pingBackend } from '../services/apiConfig';

const StepPayment = ({ plan, outletCount, sessionId, ownerEmail, ownerPhone, onPaymentComplete, onBack }) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentReference, setPaymentReference] = useState(null);

  const isMockMode = !import.meta.env.VITE_RAZORPAY_KEY_ID;

  // Wake up the Render backend before the user clicks Pay
  useEffect(() => {
    pingBackend();
  }, []);

  const callMockPayment = async () => {
    return apiFetch('/api/onboard/payment/mock', {
      method: 'POST',
      body: JSON.stringify({ plan, numberOfOutlets: outletCount, sessionId }),
      timeout: 45000,
    });
  };

  const handleMockPayment = async (isRetry = false) => {
    setProcessing(true);
    setError(null);
    try {
      const result = await callMockPayment();
      setPaymentReference(result.paymentReference);
      onPaymentComplete(result.paymentReference);
    } catch (err) {
      if (!isRetry && (err.message?.toLowerCase().includes('timed out') || err.message?.toLowerCase().includes('network'))) {
        setError('Connection slow. Retrying once...');
        try {
          await pingBackend();
          const result = await callMockPayment();
          setPaymentReference(result.paymentReference);
          onPaymentComplete(result.paymentReference);
          return;
        } catch (retryErr) {
          setError(retryErr.message || 'Payment failed after retry');
        }
      } else {
        setError(err.message || 'Payment failed');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRazorpayPayment = async (isRetry = false) => {
    setProcessing(true);
    setError(null);
    try {
      // 1. Create order on backend
      const { gatewayOrderId, amount } = await apiFetch('/api/onboard/payment/initiate', {
        method: 'POST',
        body: JSON.stringify({ plan, numberOfOutlets: outletCount, sessionId }),
        timeout: 45000,
      });

      // 2. Load Razorpay checkout script
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });

      // 3. Open Razorpay modal
      const rzp = new window.Razorpay(buildRazorpayOptions(gatewayOrderId, amount));
      rzp.on('payment.failed', () => {
        setError('Payment was cancelled or failed. Please try again.');
        setProcessing(false);
      });
      rzp.open();
    } catch (err) {
      if (!isRetry && (err.message?.toLowerCase().includes('timed out') || err.message?.toLowerCase().includes('network'))) {
        setError('Connection slow. Retrying once...');
        try {
          await pingBackend();
          const { gatewayOrderId, amount } = await apiFetch('/api/onboard/payment/initiate', {
            method: 'POST',
            body: JSON.stringify({ plan, numberOfOutlets: outletCount, sessionId }),
            timeout: 45000,
          });
          // Re-open Razorpay with the new order
          const rzp = new window.Razorpay(buildRazorpayOptions(gatewayOrderId, amount));
          rzp.on('payment.failed', () => {
            setError('Payment was cancelled or failed. Please try again.');
            setProcessing(false);
          });
          rzp.open();
          return;
        } catch (retryErr) {
          setError(retryErr.message || 'Payment failed after retry');
        }
      } else {
        setError(err.message || 'Payment failed');
      }
      setProcessing(false);
    }
  };

  const handlePayment = () => {
    if (isMockMode) {
      handleMockPayment();
    } else {
      handleRazorpayPayment();
    }
  };

  const buildRazorpayOptions = (gatewayOrderId, amount) => ({
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount: amount * 100,
    currency: 'INR',
    name: 'Softshape.ai',
    description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — Monthly`,
    order_id: gatewayOrderId,
    handler: async (response) => {
      // 4. Verify on backend
      const { paymentReference: ref } = await apiFetch('/api/onboard/payment/verify', {
        method: 'POST',
        body: JSON.stringify({
          gatewayOrderId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          sessionId,
        }),
        timeout: 45000,
      });
      setPaymentReference(ref);
      onPaymentComplete(ref);
    },
    prefill: {
      email: ownerEmail || '',
      contact: ownerPhone || '',
    },
    theme: { color: '#E53935' },
    modal: {
      ondismiss: () => {
        setProcessing(false);
      },
    },
  });

  if (paymentReference) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
          <p className="text-gray-500">{isMockMode ? 'Your mock payment has been processed.' : 'Your payment has been processed securely via Razorpay.'}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <CreditCard size={18} className="text-[#E53935]" /> Payment Details
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-400">Plan:</span> <span className="font-medium text-gray-900 capitalize">{plan}</span></div>
            <div><span className="text-gray-400">Outlets:</span> <span className="font-medium text-gray-900">{outletCount}</span></div>
            <div className="col-span-2"><span className="text-gray-400">Reference:</span> <span className="font-mono font-medium text-gray-900">{paymentReference}</span></div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <button
            onClick={() => onPaymentComplete(paymentReference, true)}
            className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          >
            Continue to Review
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#E53935]/10 flex items-center justify-center">
          <CreditCard size={48} className="text-[#E53935]" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Complete Payment</h2>
        <p className="text-gray-500">Secure your subscription with a quick payment</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-600">
          {error}
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <CreditCard size={18} className="text-[#E53935]" /> Order Summary
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Plan:</span> <span className="font-medium text-gray-900 capitalize">{plan}</span></div>
          <div><span className="text-gray-400">Outlets:</span> <span className="font-medium text-gray-900">{outletCount}</span></div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Lock size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold mb-1">{isMockMode ? 'Mock Payment Mode' : 'Secure Razorpay Checkout'}</p>
          <p>{isMockMode ? 'This is a sandbox environment. No real charges will be made. Click below to simulate a payment.' : 'Your payment is secured by Razorpay. You can pay via UPI, card, net banking, or wallet.'}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={processing}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={handlePayment}
          disabled={processing}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            !processing
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {processing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock size={18} />
              {isMockMode ? 'Pay Now (Mock)' : 'Pay Now'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default StepPayment;
