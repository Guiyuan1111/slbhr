// 模块: States/Level/FinishCounter  (init.beautified.js L64770-L64810)
      define("States/Level/FinishCounter", ["../Common/StoneButton", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e) {
            this.setAchieved = a(this.setAchieved, this);
            var f;
            var g;
            var h;
            d.__super__.constructor.call(this, b, 0, 0);
            h = 0;
            e = this.game.make.sprite(0, 0, "PopupAssets", e);
            e.anchor.set(0.5, 0.5);
            e.x = -e.width / 2;
            this.addChild(e);
            if (c !== "") {
              g = this.game.make.bitmapText(0, 0, "fontStone", c, 20);
              g.anchor.set(0.5, 0.5);
              g.x = -e.width / 2;
              g.y = 40;
              this.addChild(g);
            }
            this.achieved = f = this.game.make.sprite(0, 0, "PopupAssets", "TickIcon0000");
            f.anchor.set(0.5, 0.5);
            f.x = e.width / 2;
            f.visible = false;
            this.addChild(f);
          }
          b(d, c);
          d.prototype.setAchieved = function (a) {
            if (a) {
              this.achieved.frameName = "TickIcon0000";
            } else {
              this.achieved.frameName = "CrossIcon0000";
            }
            return this.achieved.visible = true;
          };
          return d;
        }(Phaser.Group);
      });