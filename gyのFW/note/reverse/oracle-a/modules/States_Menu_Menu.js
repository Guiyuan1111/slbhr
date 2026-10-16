// 模块: States/Menu/Menu  (init.beautified.js L67121-L67265)
      define("States/Menu/Menu", ["require", "Phaser", "../Common/UIState", "../Common/Button", "States/LevelMenu/LevelMenu", "States/Level/Level", "States/Buy/BuyMenu", "States/Settings/SettingsMenu", "States/Credits/CreditsMenu", "States/Menu/TempleHall", "States/Complete/Complete", "../Common/GoldButton"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        var i;
        var j;
        var k;
        var l;
        var m;
        var n;
        c("Phaser");
        n = c("../Common/UIState");
        d = c("../Common/Button");
        i = c("States/LevelMenu/LevelMenu");
        j = c("States/Level/Level");
        e = c("States/Buy/BuyMenu");
        l = c("States/Settings/SettingsMenu");
        f = c("States/Credits/CreditsMenu");
        m = c("States/Menu/TempleHall");
        g = c("States/Complete/Complete");
        h = c("../Common/GoldButton");
        return k = k = function (c) {
          function k() {
            this.layoutContent = a(this.layoutContent, this);
            this.skipToLevel = a(this.skipToLevel, this);
            this.startTemple = a(this.startTemple, this);
            this.showBuy = a(this.showBuy, this);
            this.showCredits = a(this.showCredits, this);
            this.showSettings = a(this.showSettings, this);
            this.afterAddContent = a(this.afterAddContent, this);
            this.preload = a(this.preload, this);
            this.onReady = new Phaser.Signal();
            k.__super__.constructor.apply(this, arguments);
          }
          b(k, c);
          k.prototype.preload = function () {
            return k.__super__.preload.apply(this, arguments);
          };
          k.prototype.afterAddContent = function () {
            var a;
            var b;
            if (this.game.progress.firstComplete) {
              this.game.progress.firstComplete = false;
              this.game.state.add("gameComplete", g);
              this.game.state.start("gameComplete", false, false, {
                success: true
              });
            }
            if (this.game.gameConfig.target === "cordova" || this.game.config.simulateCordova) {
              this.unlockButton = new d(this.game, this.game.realWidth / 2 - 100, this.game.realHeight / 2 - 100, "MenuAssets", "UnlockButton0000", this.showBuy, "pusher");
              this.root.addChild(this.unlockButton);
            }
            b = this.game.gameConfig.type === "multi" ? ["SettingsButton0000", "SettingsButton0001"] : ["SettingsButton0002", "SettingsButton0003"];
            this.settingsButton = new d(this.game, -this.game.realWidth / 2 + 100, this.game.realHeight / 2 - 100, "MenuAssets", b, this.showSettings, "pusher");
            this.root.addChild(this.settingsButton);
            this.creditsBtn = a = new h(this.game, this.game.realWidth / 2 - 40, -this.game.realHeight / 2 + 40, "?", this.showCredits, 30);
            this.creditsBtn.hitArea = new PIXI.Circle(0, 0, a.width * 3);
            this.root.addChild(a);
            return this.layoutContent();
          };
          k.prototype.showSettings = function () {
            var a;
            a = new l(this.game, this.levelState);
            a.show();
            this.currentMenu = a;
            return a.onClose.add(function (b) {
              return function () {
                a.destroy();
                return b.currentMenu = null;
              };
            }(this));
          };
          k.prototype.showCredits = function () {
            var a;
            a = new f(this.game);
            a.show();
            this.currentMenu = a;
            return a.onClose.add(function (b) {
              return function () {
                a.destroy();
                return b.currentMenu = null;
              };
            }(this));
          };
          k.prototype.showBuy = function () {
            var a;
            a = new e(this.game);
            a.show();
            this.currentMenu = a;
            return a.onClose.add(function (b) {
              return function () {
                a.destroy();
                return b.currentMenu = null;
              };
            }(this));
          };
          k.prototype.startTemple = function (a) {
            this.game.state.add("levelMenu", i);
            return this.game.state.fade("levelMenu", true, false, a);
          };
          k.prototype.skipToLevel = function (a) {
            a ||= {
              id: 0,
              filename: "",
              required: 0
            };
            this.game.state.add("level", j);
            return this.game.state.fade("level", true, false, a);
          };
          k.prototype.layoutContent = function () {
            var a;
            var b;
            k.__super__.layoutContent.call(this);
            b = this.game.realWidth;
            a = this.game.realHeight;
            if (this.unlockButton != null) {
              this.unlockButton.x = this.game.realWidth / 2 - 100;
              this.unlockButton.y = this.game.realHeight / 2 - 100;
              if (this.game.realWidth <= 900) {
                this.unlockButton.x = this.game.realWidth / 2 - 50;
                this.unlockButton.scale.set(0.7);
              } else {
                this.unlockButton.scale.set(1);
              }
            }
            if (this.settingsButton != null) {
              this.settingsButton.x = -this.game.realWidth / 2 + 100;
              this.settingsButton.y = this.game.realHeight / 2 - 100;
              if (this.game.realWidth <= 900) {
                this.settingsButton.x = -this.game.realWidth / 2 + 50;
              }
            }
            if (this.creditsBtn != null) {
              this.creditsBtn.x = this.game.realWidth / 2 - 40;
              this.creditsBtn.y = -this.game.realHeight / 2 + 40;
            }
            if (this.currentMenu != null) {
              return this.currentMenu.layoutContent();
            }
          };
          return k;
        }(n);
      });