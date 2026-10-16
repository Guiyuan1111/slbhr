// 模块: States/Common/StoneButton  (init.beautified.js L63975-L63994)
      define("States/Common/StoneButton", ["./Button", "Phaser"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b, d, e, f) {
            c.__super__.constructor.call(this, a, b, d, "MenuAssets", ["StoneButton0000", "StoneButton0001"], f, "pusher");
            this.anchor.set(0.5);
            this.label = a.make.bitmapText(0, 0, "fontStone", e, 26);
            this.label.anchor.set(0.5);
            this.label.y = -this.label.textHeight / 2;
            if (this.label.textWidth > this.sprite.width * 0.65) {
              this.sprite.width = this.label.textWidth / 0.65;
            }
            this.addChild(this.label);
          }
          a(c, b);
          return c;
        }(b);
      });