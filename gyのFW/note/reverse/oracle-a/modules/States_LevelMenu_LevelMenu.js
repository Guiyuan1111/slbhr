// 模块: States/LevelMenu/LevelMenu  (init.beautified.js L66839-L67029)
      define("States/LevelMenu/LevelMenu", ["require", "Phaser", "../Common/UIState", "./LevelButton", "States/Level/Level", "../Common/BackButton", "../Common/Button", "./LevelMenuGrid", "./LevelMenuTree", "./LevelMenuButtons", "States/Buy/Buy", "States/Complete/Complete"], function (c) {
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
        h = c("./LevelButton");
        m = c("States/Level/Level");
        d = c("../Common/BackButton");
        e = c("../Common/Button");
        j = c("./LevelMenuGrid");
        l = c("./LevelMenuTree");
        i = c("./LevelMenuButtons");
        f = c("States/Buy/Buy");
        g = c("States/Complete/Complete");
        return k = k = function (c) {
          function h() {
            this.goBack = a(this.goBack, this);
            this.startLevel = a(this.startLevel, this);
            this.layoutContent = a(this.layoutContent, this);
            this.afterAddContent = a(this.afterAddContent, this);
            this.toggleNumbers = a(this.toggleNumbers, this);
            this.preload = a(this.preload, this);
            this.init = a(this.init, this);
            this.onReady = new Phaser.Signal();
            h.__super__.constructor.apply(this, arguments);
          }
          b(h, c);
          h.prototype.init = function (a) {
            this.templeData = a;
            return this.game.currentTemple = a;
          };
          h.prototype.preload = function () {
            var a;
            h.__super__.preload.apply(this, arguments);
            a = "assets/atlasses/Temples/" + this.templeData.id;
            return this.game.load.atlasJSONArray("TempleAssets", a + "/TempleAssets.png", a + "/TempleAssets.json");
          };
          h.prototype.addContent = function () {
            var a;
            var b;
            var c;
            var f;
            var g;
            var h;
            console.log("createing MenuState");
            this.game.stage.backgroundColor = "#000000";
            h = this.game.realWidth;
            c = this.game.realHeight;
            this.bkg = b = this.game.make.tileSprite(-h / 2, -c / 2, h, c, "TempleAssets", "MenuBackground0000");
            this.root.addChild(b);
            if (this.templeData.type === "tree") {
              this.back = a = new d(this.game, -h / 2 + 100, c / 2 - 100, this.game.lang.locale("Back"), this.goBack);
              this.root.addChild(this.back);
              this.showNumBtn = new e(this.game, 0, 0, "", "", this.toggleNumbers);
              this.showNumBtn.numsVisible = false;
              f = this.game.make.bitmapText(0, 0, "fontStone", "显示关卡数", 20);
              f.anchor.set(0.5);
              this.showNumBtn.label = f;
              this.showNumBtn.addChild(f);
              this.root.addChild(this.showNumBtn);
            } else {
              if (c > 800) {
                g = this.game.make.bitmapText(0, -c / 2 + 120, "fontStone_large", this.game.lang.locale(this.templeData.label), 38);
                g.anchor.set(0, 0.5);
                g.y = -c / 2 + 120;
                g.x = 0 - g.width / 2;
              } else {
                g = this.game.make.bitmapText(-h / 2 + 50, -c / 2 + 50, "fontStone_large", this.game.lang.locale(this.templeData.label), 32);
                g.anchor.set(0, 0.5);
                g.x = -h / 2 + 50;
                g.y = -c / 2 + 50;
              }
              this.text = g;
              this.root.addChild(g);
              this.back = a = new d(this.game, -h / 2 + 100, 0, this.game.lang.locale("Back"), this.goBack);
              this.root.addChild(a);
            }
            this.afterAddContent();
            return this.onReady.dispatch();
          };
          h.prototype.toggleNumbers = function () {
            this.showNumBtn.numsVisible = !this.showNumBtn.numsVisible;
            return this.buttons.toggleNumbers(this.showNumBtn.numsVisible);
          };
          h.prototype.afterAddContent = function () {
            if (this.game.progress.firstComplete) {
              this.game.progress.firstComplete = false;
              this.game.state.add("gameComplete", g);
              this.game.state.start("gameComplete", false, false, {
                success: true
              });
            }
            if (this.game.gameConfig.target === "cordova" || this.game.config.simulateCordova) {
              this.unlockButton = new e(this.game, this.game.realWidth / 2 - 100, this.game.realHeight / 2 - 100, "MenuAssets", "UnlockButton0000", function (a) {
                return function () {
                  a.game.state.add("buy", f);
                  return a.game.state.start("buy", false, false, {
                    success: true
                  });
                };
              }(this));
              this.root.addChild(this.unlockButton);
            }
            return this.layoutContent();
          };
          h.prototype.layoutContent = function () {
            var a;
            var b;
            var c;
            h.__super__.layoutContent.call(this);
            c = this.game.realWidth;
            a = this.game.realHeight;
            this.bkg.width = c;
            this.bkg.height = a;
            this.bkg.x = -c / 2;
            this.bkg.y = -a / 2;
            if (this.text != null) {
              if (a > 800) {
                this.text.fontSize = 38;
                this.text.anchor.set(0, 0.5);
                this.text.y = -a / 2 + 100;
                this.text.x = 0 - this.text.width / 2;
              } else {
                this.text.fontSize = 32;
                this.text.anchor.set(0, 0.5);
                this.text.x = -c / 2 + 50;
                this.text.y = -a / 2 + 50;
              }
            }
            if (this.back != null) {
              if (this.templeData.type === "tree") {
                b = this.back.sprite.height / 4;
                this.back.x = -c / 2 + this.back.sprite.width / 2 + b;
                this.back.y = a / 2 - this.back.sprite.height / 2 - b;
              } else {
                b = this.back.sprite.height / 4;
                this.back.x = -c / 2 + this.back.sprite.width / 2 + b;
                this.back.y = a / 2 - this.back.sprite.height / 2 - b;
              }
            }
            if (this.unlockButton != null) {
              this.unlockButton.x = this.game.realWidth / 2 - 100;
              this.unlockButton.y = this.game.realHeight / 2 - 100;
            }
            if (this.showNumBtn != null) {
              this.showNumBtn.x = this.game.realWidth / 2 - this.showNumBtn.label.textWidth / 2 - 40;
              this.showNumBtn.y = this.game.realHeight / 2 - this.showNumBtn.label.textHeight / 2 - 40;
            }
            if (this.buttons != null) {
              this.buttons.destroy();
            }
            if (this.templeData.type === "tree") {
              this.buttons = new l(this.game, this.templeData);
              this.buttons.onClick.add(this.startLevel);
              return this.root.addChild(this.buttons);
            } else {
              this.buttons = new j(this.game, this.templeData);
              this.buttons.onClick.add(this.startLevel);
              return this.root.addChild(this.buttons);
            }
          };
          h.prototype.startLevel = function (a) {
            this.game.progress.setPlayed(a.data);
            if (this.game.menuMusic != null) {
              this.game.menuMusic.fadeOut(500);
              this.game.menuMusic.onFadeComplete.add(function (a) {
                return a.stop();
              });
            }
            this.game.state.add("level", m);
            return this.game.state.fade("level", true, false, a.data);
          };
          h.prototype.goBack = function () {
            if (this.game.state.current !== "menu") {
              return this.game.state.fade("menu", true, false);
            } else {
              return console.log("dasfasdfa");
            }
          };
          return h;
        }(n);
      });