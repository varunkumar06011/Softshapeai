import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomerMenu from './CustomerMenu';
import SliceChallenge from './SliceChallenge';

export default function UserMenuApp() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  
  // 'engagement', 'menu'
  const [view, setView] = useState('engagement');
  const [discountAmount, setDiscountAmount] = useState(0);

  useEffect(() => {
    if (!tableId) {
      navigate('/user-menu/table-1', { replace: true });
    }
  }, [tableId, navigate]);

  if (!tableId) return null;

  if (view === 'engagement') {
    return (
      <SliceChallenge 
        onComplete={(totalDiscount) => {
          setDiscountAmount(totalDiscount);
          setView('menu');
        }}
        onSkip={() => setView('menu')}
      />
    );
  }

  return <CustomerMenu tableId={tableId} discountPercentage={discountAmount} />;
}
