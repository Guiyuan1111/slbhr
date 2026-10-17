// 来源: https://github.com/ruffle-rs/ruffle blob 653ef4f41af283ca2b0b6d9db167ce392c364a51 web/src/lib.rs（web 端 rAF→dt→core.tick，本槽摘录 2026-10-17）
// 证据点: 网页端不内置任何固定步长——rAF timestamp 差值直接作为 dt 交给 core；确定性靠上层（虚拟时间/宿主）注入
    fn tick(self, timestamp: f64) {
        let mut dt = 0.0;
        let mut new_dimensions = None;
        let mut gamepad_button_events = Vec::new();
        let _ = self.with_instance_mut(|instance| {
            // Check for canvas resize.
            let canvas_width = instance.canvas.client_width();
            let canvas_height = instance.canvas.client_height();
            let device_pixel_ratio = instance.window.device_pixel_ratio(); // Changes via user zooming.
            // Calculate the elapsed time since the last tick.
            dt = instance
                .timestamp
                .map_or(0.0, |prev_timestamp| timestamp - prev_timestamp);

            // Store the timestamp of the last tick.
            instance.timestamp = Some(timestamp);
        });

        // Tick the Ruffle core.
        let _ = self.with_core_mut(|core| {
