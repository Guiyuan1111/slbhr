// 模块: States/Level/EndMenu  (init.beautified.js L64833-L64962)
      define("States/Level/EndMenu", ["./IngameMenu", "./FinishCounter", "../Common/StoneButton", "Phaser"], function (c, d, e) {
        "use strict";

        var f;
        return f = f = function (f) {
          function g() {
            this.gotoMenu = a(this.gotoMenu, this);
            this.renderContent = a(this.renderContent, this);
            return g.__super__.constructor.apply(this, arguments);
          }
          b(g, f);
          g.prototype.renderContent = function () {
            var a;
            var b;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            o = this.game.settings.controls === "single" && this.options.data.mobileTime || this.options.data.time;
            j = new d(this.game, "", "FinishIcon0000");
            h = this.options.state.diamonds;
            i = this.options.data.totalDiamonds;
            g = new d(this.game, "", "DiamondsIcon0000");
            if (this.options.data.type === "puzzle") {
              m = new d(this.game, "", "SilverIcon0000");
            } else {
              m = new d(this.game, "", "TimeIcon0000");
              if (true) {
                p = this.game.make.bitmapText(0, 0, "font", this.game.secondsToString(o), 18);
                p.alpha = 0.7;
              }
            }
            n = this.options.state.time;
            console.log("Time current: " + n);
            this.board.addChild(j);
            this.board.addChild(g);
            this.board.addChild(m);
            if (p) {
              this.board.addChild(p);
            }
            this.layoutContent = function (a) {
              return function () {
                c.prototype.layoutContent.call(a);
                j.x = -200;
                g.x = -200;
                m.x = -200;
                if (a.options.data.type === "puzzle") {
                  g.visible = false;
                  j.y = -a.contentSize.halfHeight * 0.5 + 60;
                  m.y = -a.contentSize.halfHeight * 0.5 + 140;
                } else if (a.options.data.type === "dark") {
                  j.y = -a.contentSize.halfHeight * 0.5 + 60;
                  m.y = -a.contentSize.halfHeight * 0.5 + 140;
                  g.visible = false;
                } else {
                  j.y = -a.contentSize.halfHeight * 0.5 + 20;
                  g.y = -a.contentSize.halfHeight * 0.5 + 100;
                  m.y = -a.contentSize.halfHeight * 0.5 + 180;
                }
                if (p) {
                  p.anchor.set(0.5);
                  p.x = m.x - p.textWidth / 2 - 10;
                  return p.y = m.y + 35;
                }
              };
            }(this);
            this.layoutContent();
            b = new e(this.game, 0, this.contentSize.halfHeight - 140, this.game.lang.locale("Continue"), this.gotoMenu);
            b.disable();
            this.board.addChild(b);
            a = this.game.make.sprite(5, -60, "PopupAssets", "popupArrow0000");
            a.anchor.set(0.5);
            this.board.addChild(a);
            l = this.options.data.type === "puzzle" ? "FinishStonePuzzle" : this.options.data.type === "speed" ? "FinishStoneSpeed" : this.options.data.type === "dark" ? "FinishStoneDark" : "FinishStone";
            k = this.game.make.sprite(180, -60, "PopupAssets", l + "0000");
            k.animations.add("to_1", Phaser.Animation.generateFrameNames(l, 1, 7, "", 4), 30, false);
            k.animations.add("to_2", Phaser.Animation.generateFrameNames(l, 8, 14, "", 4), 30, false);
            k.animations.add("to_3", Phaser.Animation.generateFrameNames(l, 15, 21, "", 4), 30, false);
            k.anchor.set(0.5);
            this.board.addChild(k);
            f = 700;
            return _.delay(function (c) {
              return function () {
                j.setAchieved(true);
                if (c.game != null && c.game.level != null) {
                  c.game.level.sounds.endPass.play();
                  return _.delay(function () {
                    if (c.game != null && c.game.level != null) {
                      c.game.level.sounds.endPass.play();
                      g.setAchieved(h >= i);
                      return _.delay(function () {
                        if (c.game != null && c.game.level != null) {
                          c.game.level.sounds.endPass.play();
                          if (c.options.data.type === "puzzle") {
                            m.setAchieved(c.options.state.silverDiamond > 0);
                          } else {
                            m.setAchieved(n <= o);
                          }
                          return _.delay(function () {
                            if (c.game != null && c.game.level != null) {
                              c.game.level.sounds.endDiamond.play();
                              a.frameName = "popupArrow0001";
                              k.animations.play("to_" + c.options.state.stars);
                              c.animationDone = true;
                              return b.enable();
                            }
                          }, m.visible && f);
                        }
                      }, g.visible && f);
                    }
                  }, j.visible && f);
                }
              };
            }(this), f);
          };
          g.prototype.gotoMenu = function () {
            if (this.animationDone) {
              return this.game.state.fade("levelMenu", true, false, this.game.currentTemple);
            }
          };
          return g;
        }(c);
      });