// 模块: States/Common/MuteButton  (init.beautified.js L39574-L39601)
      define("States/Common/MuteButton", ["./Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f) {
            this.updateState = a(this.updateState, this);
            this.clicked = a(this.clicked, this);
            d.__super__.constructor.call(this, b, c, e, f || "MenuAssets", "MuteButton0000", this.clicked);
            this.anchor.set(0.5);
            this.sprite.anchor.set(1, 0);
            this.updateState();
          }
          b(d, c);
          d.prototype.clicked = function () {
            console.log("mute");
            return this.updateState();
          };
          d.prototype.updateState = function () {
            if (this.game.sound.mute) {
              return this.sprite.frameName = "MuteButton0001";
            } else {
              return this.sprite.frameName = "MuteButton0000";
            }
          };
          return d;
        }(c);
      });