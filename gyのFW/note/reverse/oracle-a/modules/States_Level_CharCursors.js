// 模块: States/Level/CharCursors  (init.beautified.js L62587-L62823)
      define("States/Level/CharCursors", ["../Common/TouchButton", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (d) {
          function e(b, c) {
            this.hide = a(this.hide, this);
            this.show = a(this.show, this);
            this.updateDowns = a(this.updateDowns, this);
            this.onSettingChange = a(this.onSettingChange, this);
            this.destroy = a(this.destroy, this);
            e.__super__.constructor.call(this);
            this.game = b;
            this.id = c;
            this.active = false;
            b.settingsSignal.add(this.onSettingChange);
            this.setup();
          }
          b(e, d);
          e.prototype.destroy = function () {
            return this.game.settingsSignal.remove(this.onSettingChange);
          };
          e.prototype.onSettingChange = function (a) {
            if (a === "controls") {
              if (this.buttons) {
                this.buttons.destroy();
                this.buttons = null;
              }
              return this.setup();
            }
          };
          e.prototype.setup = function () {
            var a;
            var b;
            var d;
            var e;
            var f;
            var g;
            if (this.game.settings.controls === "dual") {
              a = window.devicePixelRatio * 0.35;
              b = this.buttons = this.game.make.sprite(0, 0);
              d = new c(this.game, 0, 0, "left", this.id);
              d.scale.set(a);
              e = new c(this.game, 0, 0, "right", this.id);
              e.scale.set(a);
              f = new c(this.game, 0, 0, "up", this.id);
              f.scale.set(a);
              this.updateDowns = g = function (a) {
                return function () {
                  a.right.isDown = a.right.buttonDown;
                  a.left.isDown = a.left.buttonDown;
                  a.up.isDown = a.up.buttonDown;
                  return a.active = a.up.isDown || a.left.isDown || a.right.isDown;
                };
              }(this);
              d.onDown = function (a) {
                return function () {
                  a.left.buttonDown = true;
                  return g();
                };
              }(this);
              e.onDown = function (a) {
                return function () {
                  a.right.buttonDown = true;
                  return g();
                };
              }(this);
              f.onDown = function (a) {
                return function () {
                  a.up.buttonDown = true;
                  return g();
                };
              }(this);
              d.onUp = function (a) {
                return function () {
                  a.left.buttonDown = false;
                  return g();
                };
              }(this);
              e.onUp = function (a) {
                return function () {
                  a.right.buttonDown = false;
                  return g();
                };
              }(this);
              f.onUp = function (a) {
                return function () {
                  a.up.buttonDown = false;
                  return g();
                };
              }(this);
              b.addChild(d);
              b.addChild(e);
              b.addChild(f);
              this.layoutContent = function (c) {
                return function () {
                  var g;
                  d.x = a * -1.2 * d.sprite.width / 2;
                  e.x = a * 1.2 * e.sprite.width / 2;
                  f.y = a * -1.2 * f.sprite.width / 2;
                  g = c.id === "wg" ? {
                    x: -c.game.realWidth / 2 + d.sprite.width * 2 / 3,
                    y: c.game.realHeight / 2 - d.sprite.height / 4
                  } : {
                    x: c.game.realWidth / 2 - d.sprite.width * 2 / 3,
                    y: c.game.realHeight / 2 - d.sprite.height / 4
                  };
                  b.x = g.x;
                  return b.y = g.y;
                };
              }(this);
              this.layoutContent();
              this.game.layers.ui.addChild(b);
              this.left = {
                isDown: false
              };
              this.right = {
                isDown: false
              };
              this.up = {
                isDown: false
              };
            } else if (this.game.settings.controls === "single") {
              a = window.devicePixelRatio * 0.5;
              b = this.buttons = this.game.make.group(0, 0);
              d = new c(this.game, 0, 0, "left", this.id);
              e = new c(this.game, 0, 0, "right", this.id);
              d.scale.set(a);
              e.scale.set(a);
              this.layoutContent = function (b) {
                return function () {
                  d.x = -b.game.realWidth / 2 + a * 0.7 * d.sprite.width / 2;
                  d.y = b.game.realHeight / 2 - a * 0.7 * d.sprite.height / 2;
                  e.x = b.game.realWidth / 2 - a * 0.7 * e.sprite.width / 2;
                  return e.y = b.game.realHeight / 2 - a * 0.7 * e.sprite.height / 2;
                };
              }(this);
              this.layoutContent();
              this.updateDowns = g = function (a) {
                return function () {
                  if (a.left.buttonDown && a.right.buttonDown) {
                    if (Date.now() - a.lastTouch < 80) {
                      a.right.isDown = a.right.lastDown = false;
                      a.left.isDown = a.left.lastDown = false;
                    }
                    a.up.isDown = true;
                  } else {
                    a.up.isDown = false;
                  }
                  if (a.left.buttonDown && !a.right.buttonDown) {
                    a.left.lastDown = true;
                    a.right.lastDown = false;
                  } else if (a.right.buttonDown && !a.left.buttonDown) {
                    a.right.lastDown = true;
                    a.left.lastDown = false;
                  }
                  if (a.left.lastDown && a.left.buttonDown) {
                    a.left.isDown = true;
                    a.right.isDown = false;
                    e.setState("up");
                    d.setState("left");
                  } else if (a.right.lastDown && a.right.buttonDown) {
                    a.right.isDown = true;
                    a.left.isDown = false;
                    d.setState("up");
                    e.setState("right");
                  } else {
                    a.right.isDown = false;
                    a.left.isDown = false;
                    d.setState("left");
                    e.setState("right");
                  }
                  a.active = a.buttons.visible && (a.up.isDown || a.left.isDown || a.right.isDown);
                  return a.lastTouch = Date.now();
                };
              }(this);
              d.onDown = function (a) {
                return function () {
                  a.left.buttonDown = true;
                  return g();
                };
              }(this);
              e.onDown = function (a) {
                return function () {
                  a.right.buttonDown = true;
                  return g();
                };
              }(this);
              d.onUp = function (a) {
                return function () {
                  a.left.buttonDown = false;
                  return g();
                };
              }(this);
              e.onUp = function (a) {
                return function () {
                  a.right.buttonDown = false;
                  return g();
                };
              }(this);
              if (this.id === "fb") {
                b.visible = false;
              }
              b.addChild(d);
              b.addChild(e);
              this.game.layers.ui.addChild(b);
              this.left = {
                isDown: false
              };
              this.right = {
                isDown: false
              };
              this.up = {
                isDown: false
              };
              this.up.visible = false;
            } else if (this.id === "wg") {
              this.up = this.game.input.keyboard.addKey(Phaser.Keyboard.W);
              this.left = this.game.input.keyboard.addKey(Phaser.Keyboard.A);
              this.right = this.game.input.keyboard.addKey(Phaser.Keyboard.D);
            } else {
              this.up = this.game.input.keyboard.addKey(Phaser.Keyboard.UP);
              this.left = this.game.input.keyboard.addKey(Phaser.Keyboard.LEFT);
              this.right = this.game.input.keyboard.addKey(Phaser.Keyboard.RIGHT);
            }
            return this;
          };
          e.prototype.updateDowns = function () {};
          e.prototype.show = function () {
            return this.buttons.visible = true;
          };
          e.prototype.hide = function () {
            return this.buttons.visible = false;
          };
          return e;
        }(Phaser.Signal);
      });