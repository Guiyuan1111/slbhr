// 模块: States/Menu/TempleHall  (init.beautified.js L39366-L39551)
      define("States/Menu/TempleHall", ["require", "Phaser", "../Common/Button", "../Common/GoldButton", "../Common/Navies"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        g = c("Phaser");
        d = c("../Common/Button");
        e = c("../Common/GoldButton");
        f = c("../Common/Navies");
        return h = function (c) {
          function h(b, c, i) {
            this.layoutContent = a(this.layoutContent, this);
            this.update = a(this.update, this);
            this.createChar = a(this.createChar, this);
            this.domainAllowsExtenral = a(this.domainAllowsExtenral, this);
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            var s;
            var t;
            var u;
            var v;
            h.__super__.constructor.call(this, b, c, i);
            this.w = this.game.realWidth;
            this.h = this.game.realHeight;
            this.bkg = m = this.game.make.sprite(0, 0, "TempleHall");
            m.anchor.set(0.5);
            this._scale = v = Math.max(this.w / m.width, this.h / m.height);
            m.scale.set(v);
            if (m.height / 2 > this.h / 2) {
              m.y = this.h / 2 - m.height / 2;
            }
            this.addChild(m);
            this.beams = l = [];
            k = 7;
            r = s = 0;
            u = k;
            for (; u >= 0 ? s <= u : s >= u; r = u >= 0 ? ++s : --s) {
              j = this.game.make.sprite(0, 0, "HallBeam");
              j.anchor.set(0.5, -0.5);
              j.alpha = 0.6 + Math.random() * 0.4;
              j.t_offset = (r - k / 2) * 2 * Math.PI / k - Math.random() * Math.PI / 6;
              j.t_speed = Math.random() * 0.6;
              j.blendMode = g.blendModes.SCREEN;
              j.cacheAsBitmap = true;
              this.addChild(j);
              l.push(j);
            }
            this.brandingLogo = new d(this.game, 0, 0, "KiziLogo", null, function (a) {
              return function () {};
            }(this));
            this.brandingLogo.anchor.set(0.5);
            this.addChild(this.brandingLogo);
            this.char1 = o = this.createChar("fire");
            this.addChild(o);
            o.scale.set(v);
            o.x = -this.w / 4;
            o.y = this.h / 2 - o.height * 2;
            this.char2 = p = this.createChar("water");
            p.scale.set(v);
            p.x = this.w / 4;
            p.y = this.h / 2 - p.height * 2;
            this.addChild(p);
            this.gameName = q = this.game.make.sprite(0, 0, "GameName");
            q.anchor.set(0.5, 0.5);
            t = Math.min(1, this.game.realWidth * 0.9 / q.width);
            q.scale.set(t);
            this.addChild(q);
            this.onStart = new g.Signal();
            this.playBtn = n = new e(this.game, 0, 0, this.game.lang.locale("Play"), function (a) {
              return function () {
                return a.onStart.dispatch(b.progress.get("temples")[0]);
              };
            }(this), 40);
            this.addChild(n);
            this.navies = new f(this.game, 0, 0);
            this.addChild(this.navies);
            this.layoutContent();
          }
          b(h, c);
          h.prototype.domainAllowsExtenral = function () {
            var a;
            var b;
            a = ["playcell.com"];
            return b = a.reduce(function (a) {
              return function (a, b) {
                if (document.referrer != null) {
                  a = a && document.referrer.indexOf(b) < 0;
                }
                if (window.location != null && window.location.hostname != null) {
                  a = a && window.location.hostname.indexOf(b) < 0;
                }
                return a;
              };
            }(this), true);
          };
          h.prototype.createChar = function (a) {
            var b;
            var c;
            var d;
            var e;
            b = this.game.make.sprite(0, 0, "CharAssets", "_default0000");
            e = this.game.make.sprite(0, 0, "CharAssets", a + "_legs_idle0000");
            e.anchor.set(0.5);
            d = this.game.make.sprite(0, 0, "CharAssets");
            d.animations.add("idle", g.Animation.generateFrameNames(a + "_head_idle", 0, 29, "", 4), 30, true);
            d.animations.play("idle");
            d.anchor.set(0.5);
            c = this.game.make.sprite(0, 0, "CharAssets", a + "_glow0000");
            c.anchor.set(0.5);
            c.y = 40;
            b.addChild(c);
            b.addChild(e);
            b.addChild(d);
            return b;
          };
          h.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            this.t ||= 0;
            this.t += 0.003;
            d = this.beams;
            b = 0;
            c = d.length;
            for (; b < c; b++) {
              a = d[b];
              a.rotation = Math.sin(a.t_offset + this.t * a.t_speed) * 0.2;
              a.y = -this.h / 2 - a._frame.height * this._scale / 2 - Math.abs(Math.sin(a.t_offset + this.t * a.t_speed) * this.h / 4);
              a.scale.set(0.6 + Math.abs(Math.sin(a.t_offset + this.t * a.t_speed)) * 0.4, this._scale);
            }
            return this.navies.update();
          };
          h.prototype.layoutContent = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            this.w = this.game.realWidth;
            this.h = this.game.realHeight;
            this._scale = i = Math.max(this.w / this.bkg._frame.width, this.h / this.bkg._frame.height);
            this.bkg.scale.set(i);
            if (this.bkg.height / 2 > this.h / 2) {
              this.bkg.y = this.h / 2 - this.bkg.height / 2;
            } else {
              this.bkg.y = 0;
            }
            this.char1.scale.set(i);
            this.char1.x = -this.w / 4;
            this.char1.y = this.h / 2 - this.char1.height * 2;
            this.char2.scale.set(i);
            this.char2.x = this.w / 4;
            this.char2.y = this.h / 2 - this.char2.height * 2;
            h = this.beams;
            b = 0;
            c = h.length;
            for (; b < c; b++) {
              a = h[b];
              a.scale.set(i * (0.3 + Math.random() * 1.3), i);
            }
            this.gameName.y = -this.game.realHeight / 5;
            this.playBtn.y = this.playBtn.height;
            f = this.gameName.height * 0.75;
            g = this.gameName.y - f / 2;
            d = this.game.realHeight / 2 + g;
            e = Math.min(0.65, d / this.brandingLogo.texture.baseTexture.height * 0.9);
            this.brandingLogo.scale.set(e);
            this.brandingLogo.y = g - d / 2;
            return this.navies.y = this.playBtn.y;
          };
          return h;
        }(g.Sprite);
      });