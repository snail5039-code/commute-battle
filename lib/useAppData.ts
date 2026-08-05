'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStore } from './store';
import { supabase } from './supabase';
import { CommuteRecord, User } from './types';

export function useAppData() {
  const { user, setUser } = useStore();
  const [records, setRecords] = useState<CommuteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select()
      .eq('id', userId)
      .single();

    if (userData) setUser(userData as User);

    const { data: recordsData } = await supabase
      .from('commute_records')
      .select()
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (recordsData) setRecords(recordsData as CommuteRecord[]);

    setLoading(false);
  }, [setUser]);

  useEffect(() => {
    const timer = setTimeout(refetch, 0);
    return () => clearTimeout(timer);
  }, [refetch]);

  return { user, records, loading, refetch };
}
