// 模块: States/Complete/Complete  (init.beautified.js L66772-L66816)
      define("States/Complete/Complete", ["./GameCompleteMenu", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (d) {
          function e() {
            this.doKill = a(this.doKill, this);
            this.create = a(this.create, this);
            this.preload = a(this.preload, this);
            this.init = a(this.init, this);
            return e.__super__.constructor.apply(this, arguments);
          }
          b(e, d);
          e.prototype.init = function (a) {
            return this.levelState = a;
          };
          e.prototype.preload = function () {};
          e.prototype.create = function () {
            var a;
            this.menu = new c(this.game, this.levelState);
            this.menu.show();
            this.menu.onClose.add(this.doKill);
            this.emitter = a = this.game.add.emitter(0, -this.game.realHeight / 2, 200);
            a.width = this.game.realWidth;
            a.makeParticles("PopupAssets", ["Confetti0000", "Confetti0001", "Confetti0002", "Confetti0003"]);
            a.minParticleScale = 0.5;
            a.maxParticleScale = 1;
            a.setYSpeed(100, 200);
            a.setXSpeed(-5, 5);
            a.minRotation = 20;
            a.maxRotation = 50;
            return a.start(false, 2500, 60, 0);
          };
          e.prototype.doKill = function () {
            this.menu.destroy();
            this.emitter.on = false;
            return _.delay(function (a) {
              return function () {
                return a.shutdown();
              };
            }(this), 5200);
          };
          return e;
        }(Phaser.State);
      });