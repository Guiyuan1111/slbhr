// 模块: States/Buy/BuyMenu  (init.beautified.js L66180-L66219)
      define("States/Buy/BuyMenu", ["../Level/IngameMenu", "../Common/StoneButton", "Phaser"], function (c, d) {
        "use strict";

        var e;
        return e = e = function (c) {
          function e(b, c) {
            this.close = a(this.close, this);
            this.renderContent = a(this.renderContent, this);
            e.__super__.constructor.call(this, b, c);
            this.onClose = new Phaser.Signal();
          }
          b(e, c);
          e.prototype.renderContent = function () {
            var a;
            var b;
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 2, "fontStone", this.game.lang.locale("unlock_all"), 26);
            b.anchor.set(0.5);
            this.board.addChild(b);
            a = new d(this.game, 0, 0, "1.19€", function (a) {
              return function () {
                return store.order("elements_full");
              };
            }(this));
            a.anchor.set(0.5);
            this.board.addChild(a);
            a = new d(this.game, 0, this.contentSize.halfHeight * 1.1 / 2, this.game.lang.locale("Cancel"), this.close);
            a.anchor.set(0.5);
            return this.board.addChild(a);
          };
          e.prototype.close = function () {
            this.hide();
            return _.delay(function (a) {
              return function () {
                return a.onClose.dispatch();
              };
            }(this), 1000);
          };
          return e;
        }(c);
      });