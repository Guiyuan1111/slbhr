// 模块: States/Level/Ground  (init.beautified.js L61754-L62482)
      define("States/Level/Ground", ["./Devices/Liquid", "./Devices/Snow", "seedrandom"], function (c, d, e) {
        "use strict";

        var f;
        return f = f = function (f) {
          function g(b, c, d) {
            this.CreateLiquid = a(this.CreateLiquid, this);
            this.CreateSnow = a(this.CreateSnow, this);
            this.CreateSnows = a(this.CreateSnows, this);
            this.createGroundFixture = a(this.createGroundFixture, this);
            this.destroy = a(this.destroy, this);
            this.drawForeground = a(this.drawForeground, this);
            this.decorate = a(this.decorate, this);
            this.getNaviesPoints = a(this.getNaviesPoints, this);
            this.getTileAt = a(this.getTileAt, this);
            this.drawTile = a(this.drawTile, this);
            var e;
            this.options = _.extend(this.options, d);
            g.__super__.constructor.call(this, b);
            this.game.physics.box2d.enable(this);
            this.body.mass = 0;
            this.body.clearFixtures();
            this.mapData = c;
            this.options.width = this.mapData.width * this.mapData.tileWidth;
            this.options.height = this.mapData.height * this.mapData.tileHeight;
            e = this.convertTilemap(this.mapData);
            this.CreateSnows(this.mapData);
            this.game.physics.box2d.setBounds(-100, -100, this.options.width + 200, this.options.height + 200);
            this.drawForeground();
            this.applyFilter();
          }
          b(g, f);
          g.prototype.options = {
            tileWidth: 32,
            tileHeight: 32,
            key: "map"
          };
          g.prototype.filterPadding = 10;
          g.prototype.getTileRight = function (a, b, c) {
            if (a.data[c] != null && a.data[c][b + 1] != null) {
              return a.data[c][b + 1];
            } else {
              return null;
            }
          };
          g.prototype.getTileLeft = function (a, b, c) {
            if (a.data[c] != null && a.data[c][b - 1] != null) {
              return a.data[c][b - 1];
            } else {
              return null;
            }
          };
          g.prototype.getTileUp = function (a, b, c) {
            if (a.data[c - 1] != null && a.data[c - 1][b] != null) {
              return a.data[c - 1][b];
            } else {
              return null;
            }
          };
          g.prototype.getTileDown = function (a, b, c) {
            if (a.data[c + 1] != null && a.data[c + 1][b] != null) {
              return a.data[c + 1][b];
            } else {
              return null;
            }
          };
          g.prototype.drawTile = function (a, b, c, d) {
            var e;
            var f;
            var g;
            var h;
            if (d === 10) {
              d = 0;
            }
            if (d === 11) {
              d = 1;
            }
            if (d === 12) {
              d = 2;
            }
            if (d === 55) {
              d = 5;
            }
            if (d === 0) {
              h = Math.floor(Math.random() * 4);
              g = "MaskBox0000" + h;
            } else {
              g = "MaskBox" + d + "0000";
            }
            e = this.game.cache.getFrameByName("GroundAssets", g);
            f = this.game.cache.getImage("GroundAssets");
            b = b - (e.width - 32) / 2 + 32;
            c = c - (e.height - 32) / 2 + 32;
            return a.drawImage(f, e.x, e.y, e.width, e.height, b, c, e.width, e.height);
          };
          g.prototype.getTileAt = function (a, b) {
            return this.mapData.layers[0].data[b][a];
          };
          g.prototype.convertTilemap = function (a) {
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
            m = 0;
            this.map = a;
            A = 0;
            v = 0;
            w = 0;
            C = 0;
            this.h = h = a.height;
            this.w = z = a.width;
            this.groundBody = c = this.body;
            this.groundBody.data.m_userData = "ground";
            this.game.level.groundBody = this.groundBody.data;
            n = this.game.add.bitmapData(this.options.width + 64, this.options.height + 64);
            while (C < h) {
              A = 0;
              B = 0;
              while (B < z) {
                x = a.layers[m].data[C][B];
                if (x && x.index > -1) {
                  d = B * this.options.tileWidth;
                  e = C * this.options.tileHeight;
                  if (x.properties.type === 0) {
                    if (A === 0) {
                      v = B * x.width;
                      w = C * x.height;
                      A = 1;
                    }
                    r = this.getTileRight(a.layers[m], B, C);
                    if (r && r.properties.type === 0) {
                      A += 1;
                      this.drawTile(n.ctx, d, e, x.properties.type);
                    } else {
                      t = new box2d.b2PolygonShape();
                      y = [];
                      u = this.groundBody.world.pxm(c.world.mpx(1) * A);
                      s = this.groundBody.world.pxm(c.world.mpx(1));
                      y.push(new box2d.b2Vec2(0, 0));
                      y.push(new box2d.b2Vec2(-u, 0));
                      y.push(new box2d.b2Vec2(-u, -s));
                      y.push(new box2d.b2Vec2(0, -s));
                      _.each(y, function (a) {
                        a.x -= c.world.pxm(v);
                        return a.y -= c.world.pxm(w);
                      });
                      t.Set(y);
                      A = 0;
                      this.createGroundFixture(t);
                      this.drawTile(n.ctx, d, e, x.properties.type);
                    }
                  } else if (x.properties.type === 5 || x.properties.type === 6 || x.properties.type === 7 || x.properties.type === 55) {
                    if (A === 0) {
                      v = B * x.width;
                      w = C * x.height;
                      A = 1;
                    }
                    r = this.getTileRight(a.layers[m], B, C);
                    if (r && r.properties.type === x.properties.type) {
                      if (A > 1) {
                        this.drawTile(n.ctx, d, e, x.properties.type);
                      }
                      A += 1;
                    } else {
                      t = this.createGroundShape(8, new box2d.b2Vec2(c.world.pxm(d) - A + 1, c.world.pxm(e)));
                      this.createGroundFixture(t);
                      this.drawTile(n.ctx, d - c.world.mpx(A - 1), e, 8);
                      t = this.createGroundShape(9, new box2d.b2Vec2(c.world.pxm(d), c.world.pxm(e)));
                      this.createGroundFixture(t);
                      this.drawTile(n.ctx, d, e, 9);
                      t = new box2d.b2PolygonShape();
                      y = [];
                      u = this.groundBody.world.pxm(c.world.mpx(1) * A);
                      s = this.groundBody.world.pxm(c.world.mpx(1));
                      y.push(new box2d.b2Vec2(-1, -s / 2 + 0.05));
                      y.push(new box2d.b2Vec2(-u + 1, -s / 2 + 0.05));
                      y.push(new box2d.b2Vec2(-u + 1, -s));
                      y.push(new box2d.b2Vec2(-1, -s));
                      _.each(y, function (a) {
                        a.x -= c.world.pxm(v);
                        return a.y -= c.world.pxm(w);
                      });
                      t.Set(y);
                      this.createGroundFixture(t);
                      this.CreateLiquid(x.properties.type, B + 1, C, A);
                      A = 0;
                    }
                  } else if (x.properties.type === -1) {
                    this.drawTile(n.ctx, d, e, 0);
                  } else {
                    t = this.createGroundShape(x.properties.type, new box2d.b2Vec2(c.world.pxm(d), c.world.pxm(e)));
                    this.createGroundFixture(t);
                    this.drawTile(n.ctx, d, e, x.properties.type);
                  }
                }
                B++;
              }
              C++;
            }
            f = this.game.make.bitmapData(this.options.width + 64, this.options.height + 64);
            g = this.game.cache.getFrameByName("TempleAssets", "ForeGround0000");
            j = this.game.cache.getImage("TempleAssets");
            i = l = 0;
            p = Math.ceil(this.options.width / 256);
            for (; p >= 0 ? l <= p : l >= p; i = p >= 0 ? ++l : --l) {
              k = o = 0;
              q = Math.ceil(this.options.height / 256);
              for (; q >= 0 ? o <= q : o >= q; k = q >= 0 ? ++o : --o) {
                B = i * 256;
                C = k * 256;
                f.ctx.drawImage(j, g.x, g.y, g.width, g.height, B, C, g.width, g.height);
              }
            }
            b = this.game.add.bitmapData(this.options.width + 64, this.options.height + 64);
            b.alphaMask(f, n);
            this.bmd = b;
            this.maskBmd = n;
            this.foregroundBmd = f;
            return c;
          };
          g.prototype.getNaviesPoints = function () {
            var a;
            var b;
            var c;
            var d;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            i = this.map;
            d = this.h;
            n = this.w;
            g = 0;
            b = this.groundBody;
            this.rng = e("ASDFA");
            m = function (a) {
              return function () {
                return Math.round(a.rng() * 3 + 3.5);
              };
            }(this);
            j = function (a) {
              return function (a, b) {
                if (i.layers[g].data[a] != null && i.layers[g].data[a][b] != null) {
                  return i.layers[g].data[a][b];
                } else {
                  return null;
                }
              };
            }(this);
            l = [{
              x: Math.floor(d / 4),
              y: Math.floor(d / 4)
            }, {
              x: Math.floor(d * 3 / 4),
              y: Math.floor(d / 4)
            }, {
              x: Math.floor(d / 4),
              y: Math.floor(d * 3 / 4)
            }, {
              x: Math.floor(d * 3 / 4),
              y: Math.floor(d / 4)
            }];
            a = function (a) {
              return function (a) {
                if (a > 0) {
                  return 1;
                } else if (a < 0) {
                  return -1;
                } else {
                  return 0;
                }
              };
            }(this);
            f = 0;
            h = l.length;
            for (; f < h; f++) {
              k = l[f];
              k.valid = false;
              c = {
                x: a(Math.random() - 0.5),
                y: a(Math.random() - 0.5)
              };
              while (k.x > 0 && k.x < n && k.y > 0 && k.y < d) {
                if (j(k.y, k.x).properties.type == null) {
                  k.valid = true;
                  break;
                }
                k.x += c.x;
                k.y += c.y;
              }
            }
            l = l.filter(function (a) {
              return a.valid;
            });
            _.each(l, function (a) {
              a.x *= b.world.mpx(1);
              return a.y *= b.world.mpx(1);
            });
            return l;
          };
          g.prototype.decorate = function (a) {
            var b;
            var c;
            var d;
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
            var F;
            var G;
            var H;
            var I;
            var J;
            var K;
            s = this.map;
            k = this.h;
            H = this.w;
            o = 0;
            c = this.groundBody;
            this.rng = e("ASDFA");
            z = function (a) {
              return function () {
                return Math.round(a.rng() * 3 + 3.5);
              };
            }(this);
            n = 0;
            q = a.length;
            for (; n < q; n++) {
              v = a[n];
              if (v.ocupy != null) {
                v.ocupy(s.layers[o].data);
              }
            }
            t = function (a) {
              return function (a, b) {
                if (s.layers[o].data[a] != null && s.layers[o].data[a][b] != null) {
                  return s.layers[o].data[a][b];
                } else {
                  return null;
                }
              };
            }(this);
            K = 1;
            f = [];
            g = new Phaser.RenderTexture(this.game, this.options.width + 64, this.options.height + 64, "decosTexture", undefined, 1);
            while (K < k) {
              I = 0;
              J = 1;
              while (J < H - 1) {
                F = s.layers[o].data[K][J];
                l = x = 0;
                for (; x <= 6; l = ++x) {
                  j = null;
                  m = y = 0;
                  for (; y <= 6; m = ++y) {
                    h = Math.max(Math.min(J + l, H - 2), 0);
                    i = Math.max(Math.min(K + m, k - 1), 0);
                    if (t(i, h).properties.type != null && !t(i, h).ocupied && f.indexOf(t(i, h)) < 0 && f.indexOf(t(i - 1, h)) < 0 && f.indexOf(t(i, h + 1)) < 0 && f.indexOf(t(i - 1, h + 1)) < 0 && f.indexOf(t(i, h - 1)) < 0 && f.indexOf(t(i - 1, h - 1)) < 0) {
                      j = s.layers[o].data[i][h];
                      f.push(j);
                      break;
                    }
                  }
                  if (j != null) {
                    break;
                  }
                }
                J += z();
              }
              K += z();
            }
            w = 0;
            l = E = 0;
            r = f.length;
            for (; E < r; l = ++E) {
              d = f[l];
              F = s.layers[o].data[d.y][d.x];
              b = this.getTileUp(s.layers[o], d.x, d.y);
              A = this.getTileRight(s.layers[o], d.x, d.y);
              p = this.getTileLeft(s.layers[o], d.x, d.y);
              G = null;
              B = 0;
              C = [1, 1];
              u = 1;
              if (F.properties.type === 0 && b != null && b.properties.type != null && A != null && A.properties.type != null && p != null && p.properties.type != null) {
                G = "O_" + (w % 2 + 1);
                B = w === "1" ? Math.floor(Math.random() * 3) * Math.PI / 2 : 0;
              } else if (F.properties.type !== 0 || b != null && b.properties.type != null) {
                if (F.properties.type === 0) {
                  G = "X";
                  B = Math.floor(Math.random() * 3) * Math.PI / 2;
                } else if (F.properties.type === 1) {
                  G = "A";
                } else if (F.properties.type === 2) {
                  G = "A";
                  C = [-1, 1];
                } else if (F.properties.type === 3) {
                  G = "V";
                } else if (F.properties.type === 4) {
                  G = "V";
                  C = [-1, 1];
                }
              } else {
                G = "T_" + (w % 3 + 1);
                u = Math.round(Math.random()) * 2 - 1;
              }
              w++;
              if (G != null) {
                D = this.game.make.sprite((d.x + 0.5) * c.world.mpx(1), (d.y + 0.5) * c.world.mpx(1), "TempleAssets", "decor_" + G + "0000");
                D.rotation = B;
                D.scale.set(u * C[0], C[1]);
                D.anchor.set(0.5);
                g.renderXY(D, D.x + 32, D.y + 32, false);
                D.destroy();
              }
            }
            this.game.cache.addRenderTexture("decosTexture", g);
            D = this.game.make.sprite(-32, -32, this.game.cache.getRenderTexture("decosTexture").texture);
            this.game.layers.decorations.addChild(D);
            return this.game.layers.decorations.cacheAsBitmap = true;
          };
          g.prototype.drawForeground = function () {
            return this.image = this.game.make.image(0, 0, this.bmd);
          };
          g.prototype.applyFilter = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            a = this.game.make.tileSprite(0, 0, this.options.width, this.options.height, "TempleAssets", "BackGround0000");
            this.game.layers.background.addChild(a);
            a.cacheAsBitmap = true;
            g = this.options.width + 64;
            b = this.options.height + 64;
            c = new Phaser.Filter.InlineFilter(this.game, g, b, 3, 16711680);
            c.init();
            d = new Phaser.Filter.OutlineFilter(this.game, g, b, 3.5, 0);
            d.init();
            f = new Phaser.Filter.ShadowFilter(this.game, g, b, 8, 0);
            f.init();
            this.image.filters = [c, d, f];
            e = new Phaser.RenderTexture(this.game, g, b, "groundTexture", undefined, 1);
            this.game.renderer.renderSession.resolution = 1;
            e.renderRawXY(this.image, 0, 0, true);
            this.game.renderer.renderSession.resolution = this.game.resolution;
            this.game.cache.addRenderTexture("groundTexture", e);
            this.sprite = this.game.make.sprite(-32, -32, this.game.cache.getRenderTexture("groundTexture").texture);
            this.game.layers.ground.addChild(this.sprite);
            this.sprite.cacheAsBitmap = true;
            this.image.destroy();
            this.bmd.destroy();
            this.maskBmd.destroy();
            return this.foregroundBmd.destroy();
          };
          g.prototype.destroy = function () {
            this.sprite.destroy();
            this.image.destroy();
            this.bmd.destroy();
            this.maskBmd.destroy();
            this.foregroundBmd.destroy();
            return g.__super__.destroy.call(this);
          };
          g.prototype.createGroundFixture = function (a, b, c) {
            var d;
            var e;
            e = new box2d.b2FixtureDef();
            e.shape = a;
            e.filter.categoryBits = 1;
            e.filter.maskBits = 4369;
            e.friction = 0.8;
            e.isSensor = b;
            e.userData = c;
            d = this.groundBody.data.CreateFixture(e);
            return d.id = this.groundBody.world.getNextFixtureId();
          };
          g.prototype.createGroundShape = function (a, b) {
            var c;
            var d;
            var e;
            var f;
            e = 1;
            d = 1;
            c = new box2d.b2PolygonShape();
            if (a === 0 || a === 10) {
              f = [];
              f.push(new box2d.b2Vec2(0, 0));
              f.push(new box2d.b2Vec2(-e, 0));
              f.push(new box2d.b2Vec2(-e, -d));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 1 || a === -2 || a === 11) {
              f = [];
              f.push(new box2d.b2Vec2(-e, 0));
              f.push(new box2d.b2Vec2(-e, -d));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 2 || a === 12) {
              f = [];
              f.push(new box2d.b2Vec2(0, 0));
              f.push(new box2d.b2Vec2(-e, -d));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 3) {
              f = [];
              f.push(new box2d.b2Vec2(0, 0));
              f.push(new box2d.b2Vec2(-e, 0));
              f.push(new box2d.b2Vec2(-e, -d));
            } else if (a === 4) {
              f = [];
              f.push(new box2d.b2Vec2(0, 0));
              f.push(new box2d.b2Vec2(-e, 0));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 5 || a === 6 || a === 7) {
              f = [];
              f.push(new box2d.b2Vec2(0, -d / 2));
              f.push(new box2d.b2Vec2(-e, -d / 2));
              f.push(new box2d.b2Vec2(-e, -d));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 8) {
              f = [];
              f.push(new box2d.b2Vec2(0, 0));
              f.push(new box2d.b2Vec2(-e - 0.3, -d / 2));
              f.push(new box2d.b2Vec2(-e - 0.3, -d));
              f.push(new box2d.b2Vec2(0, -d));
            } else if (a === 9) {
              f = [];
              f.push(new box2d.b2Vec2(0.3, -d / 2));
              f.push(new box2d.b2Vec2(-e, 0));
              f.push(new box2d.b2Vec2(-e, -d));
              f.push(new box2d.b2Vec2(0.3, -d));
            }
            _.each(f, function (a) {
              a.x -= b.x;
              return a.y -= b.y;
            });
            c.Set(f);
            return c;
          };
          g.prototype.CreateSnows = function (a) {
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
            c = a.layers[0].data;
            l = c.length;
            k = c[0].length;
            x = [];
            console.log("WE");
            e = h = 0;
            o = l;
            for (; o >= 0 ? h <= o : h >= o; e = o >= 0 ? ++h : --h) {
              j = [];
              f = m = 0;
              p = k;
              for (; p >= 0 ? m <= p : m >= p; f = p >= 0 ? ++m : --m) {
                if (e >= 0 && f >= 0 && e < l && f < k) {
                  z = c[e][f];
                  if (z.properties.type === 10) {
                    if (typeof w == "undefined" || w === null) {
                      w = {
                        x: e,
                        y: f,
                        length: 1,
                        dir: "WE"
                      };
                    } else {
                      w.length += 1;
                    }
                  } else if (w != null) {
                    x.push(w);
                    w = null;
                  }
                }
              }
            }
            console.log("SE");
            g = n = 0;
            q = k + l;
            for (; q >= 0 ? n <= q : n >= q; g = q >= 0 ? ++n : --n) {
              d = [];
              e = y = 0;
              r = g;
              for (; r >= 0 ? y <= r : y >= r; e = r >= 0 ? ++y : --y) {
                f = g - e;
                if (e >= 0 && f >= 0 && e < l && f < k) {
                  z = c[e][f];
                  if (z.properties.type === 11) {
                    if (w == null) {
                      w = {
                        x: e,
                        y: f,
                        length: 1,
                        dir: "SE"
                      };
                    } else {
                      w.length += 1;
                    }
                  } else if (w != null) {
                    x.push(w);
                    w = null;
                  }
                }
              }
            }
            console.log("SW");
            g = A = s = -Math.max(k, l);
            t = Math.max(k, l);
            for (; s <= t ? A <= t : A >= t; g = s <= t ? ++A : --A) {
              d = [];
              e = B = 0;
              u = l;
              for (; u >= 0 ? B <= u : B >= u; e = u >= 0 ? ++B : --B) {
                f = g + e;
                if (e >= 0 && f >= 0 && e < l && f < k) {
                  z = c[e][f];
                  if (z.properties.type === 12) {
                    if (w == null) {
                      w = {
                        x: e,
                        y: f,
                        length: 1,
                        dir: "SW"
                      };
                    } else {
                      w.length += 1;
                    }
                  } else if (w != null) {
                    x.push(w);
                    w = null;
                  }
                }
              }
            }
            console.log(x);
            b = 0;
            i = x.length;
            for (; b < i; b++) {
              v = x[b];
              this.CreateSnow(this, v);
            }
          };
          g.prototype.CreateSnow = function (a, b) {
            var c;
            return c = new d(this.game, a, b);
          };
          g.prototype.CreateLiquid = function (a, b, d, e) {
            var f;
            return f = new c(this.game, b - e, d, {
              type: a,
              width: e
            });
          };
          return g;
        }(Phaser.Sprite);
      });