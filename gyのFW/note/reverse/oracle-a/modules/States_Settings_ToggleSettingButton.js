// 模块: States/Settings/ToggleSettingButton  (init.beautified.js L64159-L64187)
      define("States/Settings/ToggleSettingButton", ["../Common/Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f, g, h) {
            this.setSelected = a(this.setSelected, this);
            this.myKey = f;
            d.__super__.constructor.call(this, b, c, e, "MenuAssets", [f + "0000", f + "0000"], function (a) {
              return function () {
                return h(g);
              };
            }(this), "pusher");
            this.anchor.set(0.5);
          }
          b(d, c);
          d.prototype.setSelected = function (a) {
            if (a) {
              this.downFrameName = this.myKey + "0000";
              this.upFrameName = this.myKey + "0000";
            } else {
              this.downFrameName = this.myKey + "0001";
              this.upFrameName = this.myKey + "0001";
            }
            return this.sprite.frameName = this.upFrameName;
          };
          return d;
        }(c);
      });