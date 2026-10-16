// 模块: States/Level/Clock  (init.beautified.js L64633-L64686)
      define("States/Level/Clock", ["./IngameMenu", "../Common/StoneButton", "Phaser"], function (c, d) {
        "use strict";

        var e;
        return e = e = function (c) {
          function d(b, c, e) {
            this.getElapsedSeconds = a(this.getElapsedSeconds, this);
            this.resume = a(this.resume, this);
            this.stop = a(this.stop, this);
            this.pause = a(this.pause, this);
            this.update = a(this.update, this);
            this.start = a(this.start, this);
            var f;
            d.__super__.constructor.call(this, b, c, e, "TempleAssets", "Clock0000");
            this.text = f = b.make.bitmapText(0, 0, "font", "00:00", 24);
            f.anchor.set(0);
            f.x = -this.text.textWidth / 2;
            f.y = -this.height / 2 + this.text.textHeight + 20;
            this.addChild(f);
            this.text.text = this.game.secondsToString(0);
          }
          b(d, c);
          d.prototype.start = function () {
            if (this.game != null) {
              return this.startTime = this.game.time.now;
            }
          };
          d.prototype.update = function () {
            var a;
            if (this.startTime != null && !this.stopped && this.pauseTime == null) {
              a = this.getElapsedSeconds();
              this.text.text = this.game.secondsToString(a);
              this.text.x = -this.text.textWidth / 2;
              return this.text.y = -this.height / 2 + this.text.textHeight + 20;
            }
          };
          d.prototype.pause = function () {
            if (this.pauseTime == null) {
              return this.pauseTime = this.game.time.now;
            }
          };
          d.prototype.stop = function () {
            return this.stopped = true;
          };
          d.prototype.resume = function () {
            this.startTime = this.startTime + (this.game.time.now - this.pauseTime);
            return this.pauseTime = null;
          };
          d.prototype.getElapsedSeconds = function () {
            return Math.round((this.game.time.now - this.startTime) / 1000);
          };
          return d;
        }(Phaser.Sprite);
      });