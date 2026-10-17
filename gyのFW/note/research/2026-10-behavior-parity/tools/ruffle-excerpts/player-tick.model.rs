// 来源: https://github.com/ruffle-rs/ruffle blob 653ef4f41af283ca2b0b6d9db167ce392c364a51 core/src/player.rs（tick/帧时间模型，本槽摘录 2026-10-17）
// 证据点: frame_accumulator + SWF 声明帧率跑逻辑帧; MAX_FRAMES_PER_TICK=5 防追赶螺旋; update_timers(dt) 走真实 dt
    forced_frame_rate: bool,
    actions_since_timeout_check: u32,

    frame_phase: FramePhase,

    stub_tracker: StubCollection,

    /// A time budget for executing frames.
    /// Gained by passage of time between host frames, spent by executing SWF frames.
    /// This is how we support custom SWF framerates
    /// and compensate for small lags by "catching up" (up to MAX_FRAMES_PER_TICK).
    frame_accumulator: FloatDuration,
    recent_run_frame_timings: VecDeque<f64>,

    /// Faked time passage for fooling hand-written busy-loop FPS limiters.
    time_offset: u32,
    /// In some cases, we might want to update several times in a row.
    /// For example, if the game runs at 60FPS, but the host runs at 30FPS
    /// Or if for some reason the we miss a couple of frames.
    /// However, if the code is simply slow, this is the opposite of what we want;
    /// If run_frame() consistently takes say 100ms, we don't want `tick` to try to "catch up",
    /// as this will only make it worse.
    ///
    /// This rough heuristic manages this job; for example if average run_frame()
    /// takes more than 1/3 of frame_time, we shouldn't run it more than twice in a row.
    /// This logic is far from perfect, as it doesn't take into account
    /// that things like rendering also take time. But for now it's good enough.
    fn max_frames_per_tick(&self) -> u32 {
        const MAX_FRAMES_PER_TICK: u32 = 5;

        if self.recent_run_frame_timings.is_empty() {
            5
        } else {
            let frame_time = self.frame_time(1000.0);
            let average_run_frame_time = self.recent_run_frame_timings.iter().sum::<f64>()
                / self.recent_run_frame_timings.len() as f64;
            ((frame_time / average_run_frame_time) as u32).clamp(1, MAX_FRAMES_PER_TICK)
        }
    }

    fn add_frame_timing(&mut self, elapsed: f64) {
        self.recent_run_frame_timings.push_back(elapsed);
        if self.recent_run_frame_timings.len() >= 10 {
            self.recent_run_frame_timings.pop_front();
        }
    }

    fn frame_time(&self, time_unit: f64) -> f64 {
        let frame_rate = self.frame_rate;
        if frame_rate == 0.0 || frame_rate.is_nan() {
            0.0
        } else {
            time_unit / frame_rate
        }
    }

    /// Returns the duration of a single frame.
    fn frame_duration(&self) -> FloatDuration {
        FloatDuration::from_millis(self.frame_time(1000.0))
    }

    pub fn tick(&mut self, dt: FloatDuration) {
        if !self.is_playing() {
            return;
        }

        self.frame_accumulator += dt;
        let frame_duration = self.frame_duration();

        let max_frames_per_tick = self.max_frames_per_tick();
        let mut frame = 0;

        while frame < max_frames_per_tick && self.frame_accumulator >= frame_duration {
            let timer = Instant::now();
            self.run_frame();
            let elapsed = timer.elapsed().as_millis() as f64;

            self.add_frame_timing(elapsed);

            self.frame_accumulator -= frame_duration;
            frame += 1;
            // The script probably tried implementing an FPS limiter with a busy loop.
            // We fooled the busy loop by pretending that more time has passed that actually did.
            // Then we need to actually pass this time, by decreasing frame_accumulator
            // to delay the future frame.
            if self.time_offset > 0 {
                self.frame_accumulator -= FloatDuration::from_millis(self.time_offset as f64);
            }

            // If we are stepping a single frame, immediately suspend ourselves.
            if self.run_state == RunState::Stepping {
                self.set_run_state(RunState::Suspended);
                break;
            }
        }

        // Now that we're done running code,
        // we can stop pretending that more time passed than actually did.
        // Note: update_timers(dt) doesn't need to see this either.
        // Timers will run at correct times and see correct time.
        // Also note that in Flash, a blocking busy loop would delay setTimeout
        // and cancel some setInterval callbacks, but here busy loops don't block
        // so timer callbacks won't get cancelled/delayed.
        self.time_offset = 0;

        // Sanity: If we had too many frames to tick, just reset the accumulator
        // to prevent running at turbo speed.
        if self.frame_accumulator >= frame_duration {
            self.frame_accumulator = FloatDuration::ZERO;
        }

        // Adjust playback speed for next frame to stay in sync with timeline audio tracks ("stream" sounds).
        let cur_frame_offset = self.frame_accumulator.as_millis();
        let audio_skew = self.mutate_with_update_context(|context| {
            context
                .audio_manager
                .audio_skew_time(context.audio, cur_frame_offset)
        });
        self.frame_accumulator += FloatDuration::from_secs(audio_skew);

        self.update_sockets();
        self.update_net_connections();
        self.update_timers(dt);
        self.update(|context| {
            StreamManager::tick(context, dt);
        });
        self.audio.tick();
    }

    pub fn time_til_next_timer(&self) -> Option<f64> {
        self.time_til_next_timer
    }
