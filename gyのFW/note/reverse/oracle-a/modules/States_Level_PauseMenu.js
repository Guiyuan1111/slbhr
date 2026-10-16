// 模块: States/Level/PauseMenu  (init.beautified.js L64403-L64481)
      define("States/Level/PauseMenu", ["require", "./IngameMenu", "../Common/StoneButton", "../Common/Button", "Phaser", "States/Settings/SettingsMenu"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        e = c("./IngameMenu");
        h = c("../Common/StoneButton");
        d = c("../Common/Button");
        c("Phaser");
        g = c("States/Settings/SettingsMenu");
        return f = f = function (c) {
          function e(b, c) {
            this.retry = a(this.retry, this);
            this.quit = a(this.quit, this);
            this.resume = a(this.resume, this);
            this.layoutContent = a(this.layoutContent, this);
            this.renderContent = a(this.renderContent, this);
            e.__super__.constructor.call(this, b);
            this.level = c;
          }
          b(e, c);
          e.prototype.renderContent = function () {
            var a;
            var b;
            this.label = b = this.game.make.bitmapText(0, 0, "fontStone_large", this.game.lang.locale("Paused"), 36);
            b.anchor.set(0);
            b.x = -b.width / 2;
            b.y = -this.contentSize.halfHeight * 0.5 + b.textHeight / 2;
            this.board.addChild(b);
            this.settingsButton = new d(this.game, 0, 0, "MenuAssets", ["SettingsButton0000", "SettingsButton0001"], function (a) {
              return function () {
                var b;
                a.settingsMenu = b = new g(a.game, a.levelState);
                b.show();
                return b.onClose.add(b.destroy);
              };
            }(this), "pusher");
            this.settingsButton.anchor.set(1);
            this.settingsButton.scale.set(0.9);
            this.settingsButton.x = this.contentSize.halfWidth - this.settingsButton.width;
            this.settingsButton.y = -this.contentSize.halfHeight + this.settingsButton.height + 100;
            this.board.addChild(this.settingsButton);
            this.button1 = a = new h(this.game, 0, 0, this.game.lang.locale("Retry"), this.retry);
            a.anchor.set(0);
            this.board.addChild(a);
            this.button2 = a = new h(this.game, 0, 0, this.game.lang.locale("End"), this.quit);
            a.anchor.set(0);
            this.board.addChild(a);
            this.button3 = a = new h(this.game, 0, 0, this.game.lang.locale("Resume"), this.resume);
            a.anchor.set(0);
            this.board.addChild(a);
            return this.layoutContent();
          };
          e.prototype.layoutContent = function () {
            e.__super__.layoutContent.call(this);
            this.label.x = -this.label.width / 2;
            this.label.y = -this.contentSize.halfHeight * 0.6 + this.label.textHeight / 2;
            this.button1.x = this.contentSize.halfWidth / 3;
            this.button1.y = this.contentSize.halfHeight * 0.15;
            this.button2.x = -this.contentSize.halfWidth / 3;
            this.button2.y = this.contentSize.halfHeight * 0.15;
            this.button3.x = 0;
            this.button3.y = this.contentSize.halfHeight * 0.5;
            this.settingsButton.x = this.contentSize.halfWidth - this.settingsButton.width;
            return this.settingsButton.y = -this.contentSize.halfHeight + this.settingsButton.height + 100;
          };
          e.prototype.resume = function () {
            return this.game.level.togglePause();
          };
          e.prototype.quit = function () {
            return this.level.quit();
          };
          e.prototype.retry = function () {
            return this.level.retry();
          };
          return e;
        }(e);
      });