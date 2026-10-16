// 模块: States/Level/GameOverMenu  (init.beautified.js L64985-L65033)
      define("States/Level/GameOverMenu", ["require", "Phaser", "./IngameMenu", "../Common/StoneButton"], function (c) {
        var d;
        var e;
        var f;
        c("Phaser");
        f = c("./IngameMenu");
        d = c("../Common/StoneButton");
        return e = e = function (c) {
          function e() {
            this.retry = a(this.retry, this);
            this.gotoMenu = a(this.gotoMenu, this);
            this.layoutContent = a(this.layoutContent, this);
            this.renderContent = a(this.renderContent, this);
            return e.__super__.constructor.apply(this, arguments);
          }
          b(e, c);
          e.prototype.renderContent = function () {
            var a;
            var b;
            this.label = b = this.game.make.bitmapText(0, 0, "fontStone_large", this.game.lang.locale("Game Over"), 36);
            b.anchor.set(0);
            b.x = -b.width / 2;
            b.y = -this.contentSize.halfHeight * 0.5 + b.textHeight / 2;
            this.board.addChild(b);
            a = new d(this.game, -this.contentSize.halfWidth * 0.4, this.contentSize.halfHeight * 0.4, this.game.lang.locale("Menu"), this.gotoMenu);
            a.anchor.set(0.5);
            this.board.addChild(a);
            a = new d(this.game, this.contentSize.halfWidth * 0.4, this.contentSize.halfHeight * 0.4, this.game.lang.locale("Retry"), this.retry);
            a.anchor.set(0.5);
            return this.board.addChild(a);
          };
          e.prototype.layoutContent = function () {
            e.__super__.layoutContent.call(this);
            this.label.x = -label.width / 2;
            this.label.y = -this.contentSize.halfHeight * 0.5 + label.textHeight / 2;
            this.button1.x = -this.contentSize.halfWidth / 3;
            this.button1.y = this.contentSize.halfHeight * 0.4;
            this.button2.x = this.contentSize.halfWidth / 3;
            return this.button2.y = this.contentSize.halfHeight * 0.4;
          };
          e.prototype.gotoMenu = function () {
            return this.game.state.fade("levelMenu", true, false, this.game.currentTemple);
          };
          e.prototype.retry = function () {
            return this.game.level.retry();
          };
          return e;
        }(f);
      });