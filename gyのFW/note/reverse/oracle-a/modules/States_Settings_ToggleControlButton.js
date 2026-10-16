// 模块: States/Settings/ToggleControlButton  (init.beautified.js L64210-L64265)
      define("States/Settings/ToggleControlButton", ["../Common/Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f, g, h) {
            this.setSelected = a(this.setSelected, this);
            var i;
            var j;
            var k;
            this.myKey = f;
            d.__super__.constructor.call(this, b, c, e, "MenuAssets", [f + "0000", f + "0000"], function (a) {
              return function () {
                return h(g);
              };
            }(this), "pusher");
            this.anchor.set(0.5);
            if (g === "single") {
              k = b.make.sprite(0, 0, "MenuAssets");
              k.anchor.set(0.5);
              j = Phaser.Animation.generateFrameNames("ToggleSingleScreen", 0, 12, "", 4);
              k.animations.add("forth", j, 12, false);
              k.animations.add("back", j.slice(0).reverse(), 12, false);
              i = function (a) {
                return function () {
                  if (k.animations.play("forth") != null) {
                    return k.animations.play("forth").onComplete.add(function () {
                      return a.game.time.events.add(1000, function () {
                        if (k.animations.play("back") != null) {
                          return k.animations.play("back").onComplete.add(function () {
                            return a.game.time.events.add(1000, i, a);
                          });
                        }
                      }, i, a);
                    });
                  }
                };
              }(this);
              i();
              this.addChild(k);
            }
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