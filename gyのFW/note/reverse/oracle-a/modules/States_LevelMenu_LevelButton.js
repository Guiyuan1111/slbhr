// 模块: States/LevelMenu/LevelButton  (init.beautified.js L39732-L39807)
      define("States/LevelMenu/LevelButton", ["States/Common/Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f, g, h) {
            this.destroy = a(this.destroy, this);
            this.setUp = a(this.setUp, this);
            this.setDown = a(this.setDown, this);
            var i;
            d.__super__.constructor.call(this, b, c, e);
            this.anchor.set(0.5);
            i = f === "speed" ? "DiamondSpeed" : f === "puzzle" ? "DiamondPuzzle" : f === "dark" ? "DiamondDark" : "Diamond";
            this.upFrameName = i + g;
            this.downFrameName = i + g;
            this.diamond = b.make.sprite(0, 0, "MenuAssets", this.upFrameName);
            this.diamond.anchor.set(0.5);
            this.addChild(this.diamond);
            this.hitArea = new PIXI.Circle(0, 0, this.diamond.width * 1.5);
            if (h != null) {
              if (this.game.bowser.mobile || this.game.bowser.tablet) {
                this.game.TouchManager.register(this, "touchstart", this.setDown);
                this.game.TouchManager.register(this, "touchend", function (a) {
                  return function (b, c) {
                    a.setUp();
                    if (c) {
                      if (a.game.settings.vibrate && navigator.vibrate) {
                        navigator.vibrate(50);
                      }
                      if (a.game.settings.fx) {
                        a.game.currentSounds.pusher.play();
                      }
                      return h(a);
                    }
                  };
                }(this));
              } else {
                this.game.TouchManager.register(this, "mousedown", this.setDown);
                this.game.TouchManager.register(this, "mouseup", function (a) {
                  return function (b, c) {
                    a.setUp();
                    if (c) {
                      if (a.game.settings.fx) {
                        a.game.currentSounds.pusher.play();
                      }
                      return h(a);
                    }
                  };
                }(this));
              }
            }
          }
          b(d, c);
          d.prototype.setDown = function () {
            return this.diamond.scale.set(0.95);
          };
          d.prototype.setUp = function () {
            return _.delay(function (a) {
              return function () {
                return a.diamond.scale.set(1);
              };
            }(this), 100);
          };
          d.prototype.destroy = function () {
            if (this.game.bowser.mobile || this.game.bowser.tablet) {
              this.game.TouchManager.unregister(this, "touchstart");
              this.game.TouchManager.unregister(this, "touchend");
            } else {
              this.game.TouchManager.unregister(this, "mousedown");
              this.game.TouchManager.unregister(this, "mouseup");
            }
            return d.__super__.destroy.call(this);
          };
          return d;
        }(Phaser.Sprite);
      });