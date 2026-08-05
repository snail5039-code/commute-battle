import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { user_id, record_id, weather_condition } = await req.json();

    // 기존 기록 조회
    const { data: record, error: fetchError } = await supabase
      .from('commute_records')
      .select()
      .eq('id', record_id)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const now = new Date();
    const start = new Date(record.start_time);
    const duration = Math.round((now.getTime() - start.getTime()) / 60000);

    // EXP 계산
    let exp = 10; // 기본
    if (weather_condition === 'alert' || weather_condition === 'danger') {
      exp += 10; // 고난이도 보너스
    }
    // TODO: 정시 보너스는 사용자 최근 기록 평균과 비교 필요

    // 기록 업데이트
    const { data: updated, error: updateError } = await supabase
      .from('commute_records')
      .update({
        end_time: now.toISOString(),
        commute_subtype: 'arrival',
        duration_minutes: duration,
        weather_condition,
        exp_gained: exp,
        is_on_time: false, // TODO: 정시 판정 로직
        updated_at: now.toISOString(),
      })
      .eq('id', record_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 사용자 EXP 업데이트
    const { data: user } = await supabase.from('users').select().eq('id', user_id).single();

    if (user) {
      let newLevel = user.character_level;
      let newExp = user.character_exp + exp;
      let newStage = user.character_stage;

      // 레벨업 계산
      const expNeeded = newLevel * 20;
      if (newExp >= expNeeded) {
        newLevel += 1;
        newExp -= expNeeded;

        // 진화 단계 업데이트
        if (newLevel >= 20) newStage = 'veteran';
        else if (newLevel >= 10) newStage = 'warrior';
        else if (newLevel >= 5) newStage = 'seedling';
      }

      await supabase
        .from('users')
        .update({
          character_level: newLevel,
          character_exp: newExp,
          character_stage: newStage,
          total_commute_arrivals: (user.total_commute_arrivals || 0) + 1,
        })
        .eq('id', user_id);
    }

    // TODO: 배지 진행도 자동 업데이트

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error recording arrival:', error);
    return NextResponse.json(
      { error: 'Failed to record arrival' },
      { status: 500 }
    );
  }
}
