// 模块: States/LevelMenu/LevelMenuButtons  (init.beautified.js L66305-L66578)
      define("States/LevelMenu/LevelMenuButtons", ["require", "Phaser", "./LevelButton", "States/Buy/BuyMenu", "States/Common/SoftLockMenu"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        g = c("Phaser");
        e = c("./LevelButton");
        d = c("States/Buy/BuyMenu");
        h = c("States/Common/SoftLockMenu");
        return f = f = function (c) {
          function f(b, c) {
            this.buttonClick = a(this.buttonClick, this);
            this.toggleNumbers = a(this.toggleNumbers, this);
            this.destroy = a(this.destroy, this);
            this.layoutContent = a(this.layoutContent, this);
            this.showPopup = a(this.showPopup, this);
            f.__super__.constructor.call(this, b);
            this.onClick = new g.Signal();
            this.templeData = c;
            this.addContent();
          }
          b(f, c);
          f.prototype.addContent = function () {
            var a;
            var b;
            var c;
            var d;
            var f;
            var h;
            var i;
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
            var w;
            var x;
            var y;
            var z;
            var A;
            var B;
            var C;
            var D;
            var E;
            k = this.game.realHeight * 0.9;
            C = Math.min(k * 1.2, this.game.realWidth * 0.9);
            d = 3;
            x = Math.min(k, C) < 800 ? 0.5 : 0.6;
            i = function (a) {
              return function (a) {
                return _.find(A.levels, function (b) {
                  return b._id === a;
                });
              };
            }(this);
            A = this.templeData;
            h = function (a) {
              return function (b, c) {
                var d;
                var e;
                var f;
                var g;
                var h;
                var j;
                var l;
                var m;
                var n;
                var o;
                var p;
                var q;
                var r;
                if (c == null) {
                  c = 1;
                }
                e = a.game.add.bitmapData(C, k);
                e.ctx.strokeStyle = a.templeData.color;
                e.ctx.lineWidth = x * 16;
                o = A.edges;
                h = 0;
                m = o.length;
                for (; h < m; h++) {
                  f = o[h];
                  q = i(f.source);
                  r = i(f.target);
                  if (b || q.state + r.state > 2) {
                    e.ctx.moveTo(q.x * C, q.y * k);
                    e.ctx.lineTo(r.x * C, r.y * k);
                    e.ctx.stroke();
                  }
                }
                p = A.levels;
                j = 0;
                n = p.length;
                for (; j < n; j++) {
                  l = p[j];
                  if (b || l.state > 0) {
                    g = l.type === "puzzle" ? "DiamondPuzzle_Bkg_Mask" : l.type === "speed" ? "DiamondSpeed_Bkg_Mask" : l.type === "dark" ? "DiamondDark_Bkg_Mask" : "Diamond_Bkg_Mask";
                    d = a.game.make.sprite(0, 0, "MenuAssets", g + "0000");
                    d.scale.set(x * c);
                    e.draw(d, l.x * C - d.width / 2, l.y * k - d.height / 2);
                  }
                }
                return a.game.make.image(0, 0, e);
              };
            }(this);
            this.imageAll = h(true);
            this.imageAllBig = h(true, 1.2);
            this.imageDone = h(false);
            m = new g.Filter.BevelFilter(this.game, C, k, 180, 0, 0, 1);
            m.init();
            n = new g.Filter.BevelFilter(this.game, C, k, 200, 0, 0, -1);
            n.init();
            u = new g.Filter.BevelFilter(this.game, C, k, 200, 0, 1, 1);
            u.init();
            j = new g.Filter.ColorMatrix(this.game, C, k, 16766496);
            a = new g.Filter.ColorMatrix(this.game, C, k, parseInt("0x" + this.templeData.color.replace("#", "")));
            v = new g.Filter.OutlineFilter(this.game, C, k, 3, 0);
            v.init();
            f = function (a) {
              return function (b, c) {
                var d;
                var e;
                b.filters = c;
                d = new g.RenderTexture(a.game, C, k, "treeTexture", undefined, 1);
                a.game.renderer.renderSession.resolution = 1;
                d.renderRawXY(b, 0, 0, true);
                a.game.renderer.renderSession.resolution = a.game.resolution;
                a.game.cache.addRenderTexture("treeTexture", d);
                e = a.game.make.sprite(0, 0, a.game.cache.getRenderTexture("treeTexture").texture);
                e.x = -C / 2;
                e.y = -k / 2;
                a.addChild(e);
                return e;
              };
            }(this);
            f(this.imageAllBig, [u, a]);
            f(this.imageAll, [n, a, v]);
            f(this.imageDone, [m, j]);
            this.imageAll.key.destroy();
            this.imageAllBig.key.destroy();
            this.imageDone.key.destroy();
            this.imageAll.destroy();
            this.imageAllBig.destroy();
            this.imageDone.destroy();
            y = function (a) {
              return function (a) {
                if (a === 0) {
                  return "0000";
                } else if (a === 1) {
                  return "0000";
                } else if (a === 2) {
                  return "0001";
                } else if (a === 3) {
                  return "0002";
                } else if (a === 4) {
                  return "0003";
                } else {
                  return undefined;
                }
              };
            }(this);
            t = this.game.make.group(0, 0);
            this.numbers = [];
            w = A.levels;
            l = o = 0;
            q = w.length;
            for (; o < q; l = ++o) {
              p = w[l];
              D = p.x * C - C / 2;
              E = p.y * k - k / 2;
              if (p.locked) {
                r = new g.Sprite(this.game, D, E, "MenuAssets", "Lock0000");
                r.scale.set(x);
                r.anchor.set(0.5);
                this.addChild(r);
              } else {
                c = p.state > 0 ? this.buttonClick : function (a) {
                  return function () {
                    return a.showPopup({
                      type: "softLock"
                    });
                  };
                }(this);
                b = new e(this.game, D, E, p.type, y(p.state), c);
                b.scale.set(x);
                b.anchor.set(0.5);
                b.data = p;
                this.addChild(b);
                if (p.state > 0 && p.isNew) {
                  s = new g.Sprite(this.game, D, E, "MenuAssets", "NewSign0000");
                  s.x += 40;
                  s.y -= 20;
                  s.scale.set(x);
                  s.anchor.set(0.5);
                  t.addChild(s);
                }
              }
              z = {
                font: "28px Arial",
                fill: "#ffffff",
                fontWeight: "bold",
                stroke: "#000000",
                strokeThickness: 4
              };
              B = this.game.make.text(D, E + 3, p.id, z);
              B.anchor.set(0.5);
              B.cacheAsBitmap = true;
              B.visible = false;
              this.addChild(B);
              this.numbers.push(B);
            }
            return this.addChild(t);
          };
          f.prototype.showPopup = function (a) {
            var b;
            console.log("show popup for", a.type);
            if (a.type === "softLock") {
              b = new h(this.game, {
                label: "level"
              });
            } else if (a.type === "buyTemple") {
              b = new d(this.game);
            }
            this.currentMenu = b;
            b.show();
            return b.onClose.add(function (a) {
              return function () {
                a.currentMenu.destroy();
                return a.currentMenu = null;
              };
            }(this));
          };
          f.prototype.layoutContent = function () {
            if (this.currentMenu != null && this.currentMenu.layoutContent != null) {
              return this.currentMenu.layoutContent();
            }
          };
          f.prototype.destroy = function () {
            if (this.currentMenu != null) {
              this.currentMenu.destroy();
            }
            return f.__super__.destroy.apply(this, arguments);
          };
          f.prototype.toggleNumbers = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            d = this.numbers;
            e = [];
            b = 0;
            c = d.length;
            for (; b < c; b++) {
              f = d[b];
              e.push(f.visible = a);
            }
            return e;
          };
          f.prototype.buttonClick = function (a) {
            return this.onClick.dispatch(a);
          };
          return f;
        }(g.Sprite);
      });