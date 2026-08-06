'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import DashBoard from '@/components/DashBoard';
import LandingPage from '@/components/LandingPage';
import { Activity } from 'lucide-react';

export default function Home() {
  const { user, setUser } = useStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initUser = async () => {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) {
        localStorage.removeItem('userId');
        setUser(null);
        setLoading(false);
        return;
      }
      localStorage.setItem('userId', userId);

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

  if (!user) return <LandingPage onStart={() => router.push('/login')} />;

  return <DashBoard />;
}
