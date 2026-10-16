// 模块: States/Common/Button  (init.beautified.js L39117-L39214)
      define("States/Common/Button", ["Phaser"], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b, c, e, f, g, h, i) {
            this.destroy = a(this.destroy, this);
            this.disable = a(this.disable, this);
            this.enable = a(this.enable, this);
            this.setUp = a(this.setUp, this);
            this.setDown = a(this.setDown, this);
            this.soundId = i;
            if (_.isArray(g)) {
              this.downFrameName = g[1];
              g = this.upFrameName = g[0];
            }
            if (g != null) {
              d.__super__.constructor.call(this, b, c, e, f, "_default0000");
            } else {
              d.__super__.constructor.call(this, b, c, e, f);
            }
            if (g) {
              this.sprite = b.make.sprite(0, 0, f, g);
              this.sprite.anchor.set(0.5);
              this.addChild(this.sprite);
            }
            this.id = Math.random();
            if (!this.customEvents) {
              if (this.game.bowser.mobile || this.game.bowser.tablet) {
                b.TouchManager.register(this, "touchstart", this.setDown);
                b.TouchManager.register(this, "touchend", function (a) {
                  return function (b, c) {
                    if (c && a.isDown && h != null) {
                      if (a.game.settings.vibrate && navigator.vibrate) {
                        navigator.vibrate(50);
                      }
                      if (a.game.settings.fx && a.soundId) {
                        a.game.currentSounds[a.soundId].play();
                      }
                      h(a);
                    }
                    return a.setUp();
                  };
                }(this));
              } else {
                b.TouchManager.register(this, "mousedown", this.setDown);
                b.TouchManager.register(this, "mouseup", function (a) {
                  return function (b, c) {
                    if (c && a.isDown && h != null) {
                      if (a.game.settings.fx && a.soundId) {
                        a.game.currentSounds[a.soundId].play();
                      }
                      h(a);
                    }
                    return a.setUp();
                  };
                }(this));
              }
            }
          }
          b(d, c);
          d.prototype.setDown = function () {
            this.isDown = true;
            if (!this.disabled && this.downFrameName != null && this.sprite != null) {
              this.sprite.frameName = this.downFrameName;
            }
            if (!this.disabled && this.label) {
              return this.label.scale.set(0.95);
            }
          };
          d.prototype.setUp = function () {
            this.isDown = false;
            if (!this.disabled && this.upFrameName != null && this.sprite != null) {
              this.sprite.frameName = this.upFrameName;
            }
            if (!this.disabled && this.label) {
              return this.label.scale.set(1);
            }
          };
          d.prototype.enable = function () {
            return this.disabled = false;
          };
          d.prototype.disable = function () {
            return this.disabled = true;
          };
          d.prototype.destroy = function () {
            if (this.game.bowser.mobile || this.game.bowser.tablet) {
              this.game.TouchManager.unregister(this, "touchstart");
              this.game.TouchManager.unregister(this, "touchend");
            } else {
              this.game.TouchManager.unregister(this, "mousedown");
              this.game.TouchManager.unregister(this, "mouseup");
            }
            return d.__super__.destroy.apply(this, arguments);
          };
          return d;
        }(Phaser.Sprite);
      });