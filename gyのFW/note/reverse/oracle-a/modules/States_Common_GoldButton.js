// 模块: States/Common/GoldButton  (init.beautified.js L39232-L39252)
      define("States/Common/GoldButton", ["./Button", "Phaser"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b, d, e, f, g) {
            var h;
            if (g == null) {
              g = 28;
            }
            c.__super__.constructor.call(this, a, b, d, "MenuAssets", "", f, "pusher");
            this.anchor.set(0.5);
            h = g > 28 ? "font_large" : "font";
            this.label = a.make.bitmapText(0, 0, h, e + " ", g);
            this.label.anchor.set(0.5);
            this.addChild(this.label);
          }
          a(c, b);
          return c;
        }(b);
      });