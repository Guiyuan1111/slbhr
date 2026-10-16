// 模块: States/Level/CursorToggle  (init.beautified.js L64504-L64610)
      define("States/Level/CursorToggle", ["../Common/Button"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b) {
            this.setChar = a(this.setChar, this);
            this.clicked = a(this.clicked, this);
            this.update = a(this.update, this);
            this.getAngle = a(this.getAngle, this);
            this.normalizeAngle = a(this.normalizeAngle, this);
            this.layoutContent = a(this.layoutContent, this);
            this.init = a(this.init, this);
            d.__super__.constructor.call(this, b, 0, 0, "PopupAssets", "CursorToggle0000", this.clicked);
            this.game.layers.ui.addChild(this);
            this.anchor.set(0.5);
            this.y = this.game.realHeight / 2;
            this.onChange = new Phaser.Signal();
            this.setChar("wg");
            this.vtheta = 0;
            this.atheta = 0;
            this.rotation = Math.PI;
          }
          b(d, c);
          d.prototype.init = function () {
            return requestAnimationFrame(function (a) {
              return function () {
                var b;
                var c;
                b = a.game.level.pers2.sprite;
                c = new box2d.b2Vec2(b.world.x - a.world.x, b.world.y - a.world.y);
                return a.rotation = a.getAngle();
              };
            }(this));
          };
          d.prototype.layoutContent = function () {
            return this.y = this.game.realHeight / 2;
          };
          d.prototype.normalizeAngle = function (a) {
            while (a > Math.PI * 2) {
              a -= Math.PI * 2;
            }
            while (a < 0) {
              a += Math.PI * 2;
            }
            return a;
          };
          d.prototype.getAngle = function () {
            var a;
            var b;
            var c;
            var d;
            if (this.current === "fb") {
              b = this.game.level.pers1.sprite;
              a = 0;
            } else {
              b = this.game.level.pers2.sprite;
              a = Math.PI;
            }
            d = new box2d.b2Vec2(b.world.x - this.world.x, b.world.y - this.world.y);
            return c = this.normalizeAngle(a + Math.atan2(d.y, d.x));
          };
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            b = 0.5;
            c = this.getAngle();
            a = c - this.rotation;
            if (a > Math.PI) {
              a -= Math.PI * 2;
            }
            if (a < -Math.PI) {
              a += Math.PI * 2;
            }
            this.atheta = a * 0.1;
            this.vtheta += this.atheta;
            this.vtheta *= b;
            this.rotation += this.vtheta;
            return this.rotation = this.normalizeAngle(this.rotation);
          };
          d.prototype.clicked = function () {
            console.log("toggle");
            if (this.current === "wg") {
              this.setChar("fb");
              return this.game.level.sounds.charToggle1.play();
            } else {
              this.setChar("wg");
              return this.game.level.sounds.charToggle2.play();
            }
          };
          d.prototype.setChar = function (a, b) {
            if (b == null) {
              b = null;
            }
            if (b == null || !this.game.input.hitTest(this, b.center, new Phaser.Point())) {
              if (this.current !== a) {
                this.current = a;
                return this.onChange.dispatch(this.current);
              } else {
                return undefined;
              }
            }
          };
          return d;
        }(c);
      });