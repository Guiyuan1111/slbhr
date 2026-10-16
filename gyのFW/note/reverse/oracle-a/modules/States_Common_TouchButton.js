// 模块: States/Common/TouchButton  (init.beautified.js L62505-L62564)
      define("States/Common/TouchButton", ["./Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f, g, h) {
            this.onUp = a(this.onUp, this);
            this.onDown = a(this.onDown, this);
            this.setState = a(this.setState, this);
            var i;
            if (f === "up") {
              i = "FingerRingJump0000";
            } else if (f === "right") {
              i = "FingerRingRight0000";
            } else if (f === "left") {
              i = "FingerRingLeft0000";
            }
            d.__super__.constructor.call(this, b, c, e, "PopupAssets", i, h);
            this.sprite.anchor.set(0.5);
            this.anchor.set(0.5);
            if (g === "fb") {
              this.sprite.tint = 16757917;
            } else {
              this.sprite.tint = 10347007;
            }
            this.alpha = 0.7;
            this.initialFrame = i;
            b.TouchManager.register(this, "touchstart", function (a) {
              return function () {
                console.log("down");
                a.isDown = true;
                a.alpha = 0.3;
                return a.onDown();
              };
            }(this));
            b.TouchManager.register(this, "touchend", function (a) {
              return function () {
                console.log("up");
                a.isDown = false;
                a.alpha = 0.5;
                return a.onUp();
              };
            }(this));
            this.hitArea = new PIXI.Circle(0, 0, this.sprite.width);
          }
          b(d, c);
          d.prototype.customEvents = true;
          d.prototype.setState = function (a) {
            if (a === "up") {
              this.sprite.frameName = "FingerRingJump0000";
            } else {
              this.sprite.frameName = this.initialFrame;
            }
            return this.sprite.cacheAsBitmap = true;
          };
          d.prototype.onDown = function () {};
          d.prototype.onUp = function () {};
          return d;
        }(c);
      });