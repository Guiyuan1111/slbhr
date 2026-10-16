// 模块: States/Menu/MultiHall  (init.beautified.js L67705-L67862)
      define("States/Menu/MultiHall", ["require", "Phaser", "../Common/GoldButton", "../Common/Navies", "States/Menu/TempleSelector", "States/Buy/BuyMenu", "States/Common/SoftLockMenu", "bwMatrix"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        var i;
        var j;
        h = c("Phaser");
        e = c("../Common/GoldButton");
        g = c("../Common/Navies");
        j = c("States/Menu/TempleSelector");
        d = c("States/Buy/BuyMenu");
        i = c("States/Common/SoftLockMenu");
        c("bwMatrix");
        return f = function (c) {
          function e(b, c, d) {
            this.destroy = a(this.destroy, this);
            this.showPopup = a(this.showPopup, this);
            this.layoutContent = a(this.layoutContent, this);
            this.update = a(this.update, this);
            this.drawBackgrounds = a(this.drawBackgrounds, this);
            this.setBackground = a(this.setBackground, this);
            var f;
            var i;
            e.__super__.constructor.call(this, b, c, d);
            this.templeSelector = f = new j(this.game, 0, this.game.realHeight / 2);
            this.w = this.game.realWidth;
            this.h = this.game.realHeight;
            this.paralaxFactor = 3;
            this.bkg = this.drawBackgrounds();
            this.addChild(this.bkg);
            this.title = i = this.game.make.sprite(0, 0, "GameName");
            i.anchor.set(0.5, 0.5);
            i.cacheAsBitmap = true;
            this.addChild(i);
            this.onStart = new h.Signal();
            f.onTarget.add(_.debounce(this.setBackground, 800));
            f.onSelected.add(function (a) {
              return function (b) {
                return a.onStart.dispatch(b);
              };
            }(this));
            f.onShowPopup.add(this.showPopup);
            this.addChild(f);
            this.navies = new g(this.game, 0, 0);
            this.addChild(this.navies);
            this.game.time.advancedTiming = true;
            this.setBackground(f.getTarget(), false);
          }
          b(e, c);
          e.prototype.setBackground = function (a, b) {
            var c;
            var d;
            if (b == null) {
              b = true;
            }
            c = this.backgroundImages[a.data.id];
            if (this.currentBkg !== c) {
              if (b) {
                c.alpha = 0;
                d = this.game.add.tween(c).to({
                  alpha: 1
                }, 800, h.Easing.Quadratic.InOut, true);
                d.onComplete.add(function (a) {
                  return function () {
                    return c.alpha = 1;
                  };
                }(this));
              }
              this.currentBkg = c;
              this.bkg.addChild(c);
              return this.bkg.bringToTop(c);
            }
          };
          e.prototype.drawBackgrounds = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            k = this.game.progress.get("temples");
            this.backgroundImages = {};
            this.bkgBmd = a = this.game.make.bitmapData(1366, 768);
            a.fill(0, 0, 0, 1);
            c = this.game.make.sprite(0, 0, a);
            c.anchor.set(0.5);
            d = f = 0;
            g = k.length;
            for (; f < g; d = ++f) {
              j = k[d];
              i = j.id;
              e = "TempleHall" + i.charAt(0).toUpperCase() + i.slice(1);
              if (j.locked || j.softLocked) {
                b = c;
              } else {
                b = this.game.make.sprite(0, 0, e);
                b.anchor.set(0.5);
                h = Math.max(this.w / 1366, this.h / 768);
                b.scale.set(h);
                b.cacheAsBitmap = true;
              }
              this.backgroundImages[j.id] = b;
            }
            return this.game.make.group(0, 0);
          };
          e.prototype.update = function () {
            if (this.game.config.showFps) {
              $("#debug-fps").html(this.game.time.fps);
            }
            this.templeSelector.update();
            return this.navies.update();
          };
          e.prototype.layoutContent = function () {
            var a;
            var b;
            var c;
            var d;
            this.w = this.game.realWidth;
            this.h = this.game.realHeight;
            d = Math.max(this.w / 1366, this.h / 768);
            c = this.backgroundImages;
            for (b in c) {
              a = c[b];
              a.scale.set(d);
              a.x = 0;
            }
            this.templeSelector.y = this.game.realHeight / 2;
            this.templeSelector.layoutContent();
            this.title.y = -this.game.realHeight / 2 + (this.game.realHeight - this.templeSelector.height) / 2 - this.title.height / 2;
            return this.navies.y = this.game.realHeight / 2 - this.templeSelector.strip_height / 2;
          };
          e.prototype.showPopup = function (a) {
            var b;
            console.log("show popup for", a.type);
            if (a.type === "softLock") {
              b = new i(this.game, {
                label: "temple"
              });
            } else if (a.type === "buyTemple") {
              b = new d(this.game);
            }
            b.show();
            return b.onClose.add(b.destroy);
          };
          e.prototype.destroy = function () {
            this.bkgBmd.destroy();
            return e.__super__.destroy.apply(this, arguments);
          };
          return e;
        }(h.Sprite);
      });