// 模块: States/Common/BackButton  (init.beautified.js L66140-L66157)
      define("States/Common/BackButton", ["./Button", "Phaser"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b, d, e, f) {
            c.__super__.constructor.call(this, a, b, d, "MenuAssets", ["BackButton0000", "BackButton0001"], f, "pusher");
            this.anchor.set(0.5);
            this.label = a.make.bitmapText(0, 0, "fontStone", e, 28);
            this.label.anchor.set(0);
            this.label.y = -this.label.textHeight / 2 - 12;
            this.label.x = 40;
            this.addChild(this.label);
          }
          a(c, b);
          return c;
        }(b);
      });