// 模块: States/Level/Devices/TimedPusher  (init.beautified.js L59252-L59409)
      define("States/Level/Devices/TimedPusher", ["./Pusher"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.ocupy = a(this.ocupy, this);
            this.checkState = a(this.checkState, this);
            this.doRegister = a(this.doRegister, this);
            this.destroy = a(this.destroy, this);
            this.sounds = a(this.sounds, this);
            var e;
            var f;
            var g;
            d.__super__.constructor.call(this, b, c);
            f = this.game.make.sprite(0, 0, "MechAssets", "timed_pusher_base0000");
            f.anchor.set(0.5);
            this.base.addChild(f);
            g = this.game.make.sprite(0, 0, "MechAssets", "timed_pusher_light_off0000");
            g.anchor.set(0.5);
            this.base.addChild(g);
            g.offFrameName = "timed_pusher_light_off0000";
            g.onFrameName = "timed_pusher_light_off0000";
            this.lights.push(g);
            this.baseLight = e = this.game.make.sprite(0, 0, "MechAssets", "timed_pusher_light_off0000");
            e.anchor.set(0.5);
            this.base.addChild(e);
            e.offFrameName = "timed_pusher_light_off0000";
            e.onFrameName = "timed_pusher_light_on0000";
            e.cacheAsBitmap = true;
            this.lights.push(e);
            this.clock = this.game.make.graphics(0, 27);
            this.clock.cacheAsBitmap = true;
            this.registerDevice();
            this.downState = 0;
          }
          b(d, c);
          d.prototype.timer = null;
          d.prototype.sounds = function () {
            return ["pusher", "clock"];
          };
          d.prototype.destroy = function () {
            if (this.sound != null) {
              this.sound.stop();
            }
            return d.__super__.destroy.apply(this, arguments);
          };
          d.prototype.doRegister = function () {};
          d.prototype.checkState = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            f = this.joint.GetJointTranslation();
            if (this.downState === 0 && f > 0) {
              this.downState = 1;
              this.game.level.sounds.pusher.play();
              if (this.sound != null && this.sound.isPlaying) {
                this.sound.stop();
              }
            } else if (this.downState === 1 && f <= 0) {
              this.downState = 0;
              this.game.level.sounds.pusher.play();
              if (this.sound != null && this.sound.isPlaying) {
                this.sound.stop();
              }
            }
            if (f > 0) {
              if (this.state == 0 && (this.state = 1)) {
                this.signal.dispatch(this);
              }
              if (this.timer == null) {
                this.timer = this.game.time.create(true);
                this.timer.add(this.options.properties.time, function (a) {
                  return function () {
                    a.state = 0;
                    a.game.level.sounds.pusher.play();
                    a.signal.dispatch(a);
                    return a.timer = null;
                  };
                }(this));
              }
              this.timer.stop(false);
              this.timer.start();
            } else if (!this.timer && this.state === 1 && f <= 0) {
              this.state = 0;
              this.signal.dispatch(this);
            }
            if (this.state === 1) {
              if (this.baseLight.mask == null) {
                this.base.addChild(this.clock);
                this.baseLight.mask = this.clock;
              }
              if (this.downState === 0 && (this.sound == null || !this.sound.isPlaying)) {
                d = 22796;
                this.sound = this.game.level.sounds.clock.play(null, (d - this.options.properties.time) / 1000);
              }
              a = 0;
              b = 0;
              g = 20;
              c = Math.max(0, Math.min(1, 1 - this.timer.ms / this.options.properties.time));
              c = Math.ceil(c * 12) / 12;
              h = Math.PI * -2 * c - Math.PI / 2;
              e = -Math.PI / 2;
              console.log("angling " + this.timer.ms + " " + this.options.properties.time + " " + (1 - this.timer.ms / this.options.properties.time));
              if (this.lastDrawnAngle !== h) {
                this.clock.clear();
                this.clock.beginFill(16777215, 1);
                this.clock.moveTo(a, b);
                this.clock.arc(a, b, g, h, e);
                this.clock.lineTo(a, b);
                this.clock.cacheAsBitmap = true;
                return this.lastDrawnAngle = h;
              }
            } else if (this.lastDrawnAngle) {
              this.base.removeChild(this.clock);
              this.baseLight.mask = null;
              return this.lastDrawnAngle = null;
            }
          };
          d.prototype.ocupy = function (a) {
            var b;
            var c;
            b = this.options.x / 32;
            c = this.options.y / 32;
            this.ocupyTile(a, b, c);
            this.ocupyTile(a, b - 1, c);
            this.ocupyTile(a, b - 2, c);
            this.ocupyTile(a, b + 1, c);
            this.ocupyTile(a, b, c - 1);
            this.ocupyTile(a, b - 1, c - 1);
            this.ocupyTile(a, b - 2, c - 1);
            return this.ocupyTile(a, b + 1, c - 1);
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            if (this.state === 1) {
              a.ctx.globalCompositeOperation = "lighter";
              c = {
                x: this.options.x + a.offset.x,
                y: this.options.y + a.offset.y + 12
              };
              b = a.ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 80);
              b.addColorStop(0, "rgba(255,255,255,1)");
              b.addColorStop(0.5, "rgba(255,255,255,0.2)");
              b.addColorStop(1, "transparent");
              return a.circle(c.x, c.y, 90, b);
            }
          };
          return d;
        }(c);
      });