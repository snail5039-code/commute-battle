import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { home_address, work_address } = await req.json();

    const user_id = 'temp_' + Date.now(); // TODO: 실제 인증 추가 시 사용자 ID로 변경

    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          id: user_id,
          home_address,
          work_address,
          character_level: 1,
          character_exp: 0,
          character_stage: 'alg',
          total_commute_starts: 0,
          total_commute_arrivals: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error initializing user:', error);
    return NextResponse.json({ error: 'Failed to initialize user' }, { status: 500 });
  }
}
