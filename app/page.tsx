'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import InitModal from '@/components/InitModal';
import DashBoard from '@/components/DashBoard';
import LandingPage from '@/components/LandingPage';
import { Activity } from 'lucide-react';

export default function Home() {
  const { user, setUser } = useStore();
  const [loading, setLoading] = useState(true);
  const [showInit, setShowInit] = useState(false);

  useEffect(() => {
    const initUser = async () => {
      const userId = localStorage.getItem('userId');

      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select()
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Supabase error:', error);
        } else if (data) {
          setUser(data as User);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
      }

      setLoading(false);
    };

    initUser();
  }, [setUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Activity className="animate-spin" size={24} />
      </div>
    );
  }

  if (showInit || !user) {
    if (showInit) {
      return <InitModal onComplete={() => setShowInit(false)} />;
    }

    return <LandingPage onStart={() => setShowInit(true)} />;
  }

  return <DashBoard />;
}
