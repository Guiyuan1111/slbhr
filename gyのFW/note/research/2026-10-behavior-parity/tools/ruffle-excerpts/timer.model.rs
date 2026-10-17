// 来源: https://github.com/ruffle-rs/ruffle blob 653ef4f41af283ca2b0b6d9db167ce392c364a51 core/src/timer.rs（AS 定时器走真实 dt，与逻辑帧解耦，本槽摘录 2026-10-17）

    /// The current global time.
    cur_time: u64,
}

impl<'gc> Timers<'gc> {
    /// Ticks all timers and runs necessary callbacks.
    pub fn update_timers(context: &mut UpdateContext<'gc>, dt: FloatDuration) -> Option<f64> {
        context.timers.cur_time = context
            .timers
            .cur_time
            .wrapping_add((dt.as_millis() * Self::TIMER_SCALE) as u64);

        if context.timers.is_empty() {
            return None;
        }

        let level0 = context.stage.root_clip();

        let mut tick_count = 0;

        // We have to be careful because the timer list can be mutated while updating;
        // a timer callback could add more timers, clear timers (including itself), etc.
        while context
            .timers
            .peek()
            .map(|timer| timer.tick_time)
            .unwrap_or(context.timers.cur_time)
            < context.timers.cur_time
        {
            let timer = context.timers.peek().unwrap();
