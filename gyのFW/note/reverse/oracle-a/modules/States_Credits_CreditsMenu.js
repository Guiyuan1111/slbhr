// 模块: States/Credits/CreditsMenu  (init.beautified.js L67052-L67098)
      define("States/Credits/CreditsMenu", ["../Level/IngameMenu", "../Common/StoneButton", "Phaser"], function (c, d) {
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
            var c;
            var e;
            var f;
            c = this.contentSize.halfWidth;
            b = this.contentSize.halfHeight;
            f = this.game.lang.locale("credits_to");
            e = this.game.make.bitmapText(0, -160, "font", f, 20, "center");
            e.anchor.set(0.5);
            this.board.addChild(e);
            f = "Oslo Albet \r \r Anna Tamarit \r \r Jan Villanueva";
            e = this.game.make.bitmapText(0, -40, "font", f, 24, "center");
            e.anchor.set(0.5);
            this.board.addChild(e);
            f = "septimania 2018";
            e = this.game.make.bitmapText(0, 80, "font", f, 16, "center");
            e.anchor.set(0.5);
            this.board.addChild(e);
            a = new d(this.game, 0, b * 1.1 / 2, this.game.lang.locale("Ok"), this.close);
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