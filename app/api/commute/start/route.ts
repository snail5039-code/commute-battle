import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { user_id, type } = await req.json(); // type: 'commute' or 'return'
    const today = new Date().toISOString().split('T')[0];

    // 같은 날 기존 기록 확인
    const { data: existing } = await supabase
      .from('commute_records')
      .select()
      .eq('user_id', user_id)
      .eq('date', today)
      .eq('type', 'commute')
      .single();

    if (existing && !existing.end_time) {
      return NextResponse.json(
        { error: '이미 출근 중입니다. 도착을 먼저 입력해주세요' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('commute_records')
      .insert({
        user_id,
        date: today,
        type: 'commute',
        commute_subtype: 'start',
        start_time: new Date().toISOString(),
        is_on_time: false,
        exp_gained: 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error starting commute:', error);
    return NextResponse.json(
      { error: 'Failed to start commute' },
      { status: 500 }
    );
  }
}
