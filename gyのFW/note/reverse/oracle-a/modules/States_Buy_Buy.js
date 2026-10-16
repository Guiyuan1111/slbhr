// 模块: States/Buy/Buy  (init.beautified.js L66659-L66691)
      define("States/Buy/Buy", ["./BuyMenu", "Phaser"], function (c) {
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
            this.menu = new c(this.game);
            this.menu.show();
            return this.menu.onClose.add(this.doKill);
          };
          e.prototype.doKill = function () {
            this.menu.destroy();
            return _.delay(function (a) {
              return function () {
                return a.shutdown();
              };
            }(this), 1000);
          };
          return e;
        }(Phaser.State);
      });