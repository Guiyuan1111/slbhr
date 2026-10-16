// 模块: States/Settings/SettingsMenu  (init.beautified.js L64288-L64380)
      define("States/Settings/SettingsMenu", ["../Level/IngameMenu", "../Common/StoneButton", "./ToggleSettingButton", "./ToggleControlButton", "Phaser"], function (c, d, e, f) {
        "use strict";

        var g;
        return g = g = function (c) {
          function g(b, c) {
            this.changeControls = a(this.changeControls, this);
            this.chagneSetting = a(this.chagneSetting, this);
            this.setState = a(this.setState, this);
            this.close = a(this.close, this);
            this.renderContent = a(this.renderContent, this);
            g.__super__.constructor.call(this, b, c);
            this.onClose = new Phaser.Signal();
          }
          b(g, c);
          g.prototype.renderContent = function () {
            var a;
            var b;
            var c;
            var g;
            c = this.contentSize.halfWidth;
            b = this.contentSize.halfHeight;
            if (this.game.settings.controls !== "keyboard") {
              this.single = a = new f(this.game, -120, -b / 3, "ToggleControlButtonSingle", "single", this.changeControls);
              a.anchor.set(0.5);
              this.board.addChild(a);
              g = this.game.make.bitmapText(0, -b / 3, "font", "or", 18);
              g.anchor.set(0.5);
              this.board.addChild(g);
              this.dual = a = new f(this.game, 120, -b / 3, "ToggleControlButtonDual", "dual", this.changeControls);
              a.anchor.set(0.5);
              this.board.addChild(a);
              this.vibrate = a = new e(this.game, -c / 2, b / 6, "VibrateButton", "vibrate", this.chagneSetting);
              a.anchor.set(0.5);
              this.board.addChild(a);
              this.music = a = new e(this.game, 0, b / 6, "MusicButton", "music", this.chagneSetting);
              a.anchor.set(0.5);
              this.board.addChild(a);
              this.fx = a = new e(this.game, c / 2, b / 6, "FxButton", "fx", this.chagneSetting);
              a.anchor.set(0.5);
              this.board.addChild(a);
            } else {
              this.music = a = new e(this.game, c / 3, 0, "MusicButton", "music", this.chagneSetting);
              a.anchor.set(0.5);
              this.board.addChild(a);
              this.fx = a = new e(this.game, -c / 3, 0, "FxButton", "fx", this.chagneSetting);
              a.anchor.set(0.5);
              this.board.addChild(a);
            }
            this.setState();
            this.button = a = new d(this.game, 0, b * 1.1 / 2, this.game.lang.locale("Ok"), this.close);
            a.anchor.set(0.5);
            return this.board.addChild(a);
          };
          g.prototype.close = function () {
            this.hide();
            return _.delay(function (a) {
              return function () {
                return a.onClose.dispatch();
              };
            }(this), 1000);
          };
          g.prototype.setState = function () {
            if (this.dual && this.single) {
              if (this.game.settings.controls === "dual") {
                this.dual.setSelected(true);
                this.single.setSelected(false);
              } else {
                this.dual.setSelected(false);
                this.single.setSelected(true);
              }
            }
            if (this.vibrate) {
              this.vibrate.setSelected(this.game.settings.vibrate);
            }
            this.music.setSelected(this.game.settings.music);
            return this.fx.setSelected(this.game.settings.fx);
          };
          g.prototype.chagneSetting = function (a) {
            this.game.settings[a] = !this.game.settings[a];
            this.game.saveSettings();
            this.game.settingsSignal.dispatch(a);
            return this.setState();
          };
          g.prototype.changeControls = function (a) {
            this.game.settings.controls = a;
            this.game.saveSettings();
            this.game.settingsSignal.dispatch("controls");
            return this.setState();
          };
          return g;
        }(c);
      });